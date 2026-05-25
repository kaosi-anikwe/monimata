"""
Shared test fixtures for MoniMata API tests.

Uses a dedicated PostgreSQL test database (same server as dev).
All external services (Redis, Celery, push notifications) are mocked.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import Generator
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

# ── Environment overrides (MUST be set before any app imports) ────────────────
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-ci")
os.environ.setdefault("AES_ENCRYPTION_KEY", "a" * 64)
os.environ.setdefault("FERNET_KEY", "Pv6XOPHYEGaU7xH0vKO7WF5QAiZZQjje61Hib1IRCfE=")
os.environ.setdefault("ENV", "development")
os.environ.setdefault("SENTRY_DSN", "")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.database import Base, get_db
from app.core.deps import CurrentUser, get_current_user

# ── Test database engine ──────────────────────────────────────────────────────
# Always use a dedicated test database to avoid touching real data.
# Derives "<name>_test" from DATABASE_URL if TEST_DATABASE_URL is not set.


def _derive_test_url(url: str) -> str:
    """Append '_test' to the database name in a PostgreSQL URL."""
    # postgresql://user:pass@host:port/dbname -> ...dbname_test
    base, _, db_and_params = url.rpartition("/")
    db_name, *params = db_and_params.split("?", 1)
    if not db_name.endswith("_test"):
        db_name = f"{db_name}_test"
    suffix = f"?{params[0]}" if params else ""
    return f"{base}/{db_name}{suffix}"


def _ensure_test_db_exists(url: str) -> None:
    """Create the test database if it doesn't already exist."""
    from sqlalchemy import text

    base, _, db_and_params = url.rpartition("/")
    db_name = db_and_params.split("?", 1)[0]
    maint_engine = create_engine(f"{base}/postgres", isolation_level="AUTOCOMMIT")
    with maint_engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :name"),
            {"name": db_name},
        ).scalar()
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{db_name}"'))
    maint_engine.dispose()
    # Ensure required extensions exist in the test database.
    ext_engine = create_engine(url, isolation_level="AUTOCOMMIT")
    with ext_engine.connect() as conn:
        try:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        except Exception:
            pass  # extension may already exist or require superuser
    ext_engine.dispose()


_TEST_DB_URL = os.environ.get("TEST_DATABASE_URL") or _derive_test_url(settings.DATABASE_URL)
_ensure_test_db_exists(_TEST_DB_URL)

_TEST_ENGINE = create_engine(
    _TEST_DB_URL,
    pool_pre_ping=True,
    pool_size=5,
)

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_TEST_ENGINE)

# ── Test user constants ───────────────────────────────────────────────────────

TEST_USER_ID = str(uuid.uuid4())
TEST_USER_ID_2 = str(uuid.uuid4())
TEST_USERNAME = "testuser"


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _mock_redis():
    """Mock Redis globally so no real Redis connection is needed."""
    mock_redis = MagicMock()
    mock_redis.pipeline.return_value = MagicMock()
    mock_redis.pipeline.return_value.execute.return_value = []
    mock_redis.mget.return_value = []
    mock_redis.get.return_value = None
    mock_redis.exists.return_value = 0
    mock_redis.publish.return_value = None
    with (
        patch("app.core.redis_client.get_redis", return_value=mock_redis),
        patch("app.core.redis_client._redis_client", mock_redis),
    ):
        yield mock_redis


@pytest.fixture(autouse=True)
def _mock_celery():
    """Mock Celery tasks so no broker is needed."""
    with (
        patch("app.worker.celery_app.celery_app", MagicMock()),
        patch.dict("sys.modules", {"app.worker.tasks": MagicMock()}),
    ):
        yield


@pytest.fixture(autouse=True)
def _mock_notify():
    """Mock WebSocket notifications."""
    with patch("app.ws_manager.notify_user"), patch("app.ws_manager.async_notify_user"):
        yield


@pytest.fixture(scope="session", autouse=True)
def _create_tables():
    """Create all tables once for the test session, drop when done."""
    import app.models.bank_account  # noqa: F401
    import app.models.budget  # noqa: F401
    import app.models.category  # noqa: F401
    import app.models.narration_map  # noqa: F401
    import app.models.nudge  # noqa: F401
    import app.models.nudge_rule  # noqa: F401
    import app.models.nudge_stat  # noqa: F401
    import app.models.recurring_rule  # noqa: F401
    import app.models.target  # noqa: F401
    import app.models.transaction  # noqa: F401
    import app.models.user  # noqa: F401
    import app.models.user_ai_credential  # noqa: F401
    import app.models.user_ai_usage_log  # noqa: F401
    import app.models.user_category_rule  # noqa: F401

    Base.metadata.create_all(bind=_TEST_ENGINE)
    yield
    Base.metadata.drop_all(bind=_TEST_ENGINE)


@pytest.fixture()
def db() -> Generator[Session, None, None]:
    """Provide a database session wrapped in a transaction that rolls back."""
    connection = _TEST_ENGINE.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    # Use SAVEPOINT so that session.commit() inside tests does not
    # commit the outer transaction.  After each commit() a new
    # SAVEPOINT is started automatically.
    session.begin_nested()

    from sqlalchemy import event

    @event.listens_for(session, "after_transaction_end")
    def restart_savepoint(sess, trans):
        if trans.nested and not trans._parent.nested:
            sess.begin_nested()

    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture()
def client(db: Session) -> Generator[TestClient, None, None]:
    """TestClient with DB and auth overrides."""

    def _override_get_db():
        try:
            yield db
        finally:
            pass

    def _override_get_current_user():
        return CurrentUser(id=TEST_USER_ID, username=TEST_USERNAME)

    # Lazy import to avoid import-time side effects
    from app.main import app

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_user] = _override_get_current_user

    with TestClient(app, raise_server_exceptions=False, headers={"X-App-Version": "99.0.0"}) as c:
        yield c

    app.dependency_overrides.clear()


@pytest.fixture()
def unauth_client(db: Session) -> Generator[TestClient, None, None]:
    """TestClient without auth — uses the real get_current_user dependency."""

    def _override_get_db():
        try:
            yield db
        finally:
            pass

    from app.main import app

    app.dependency_overrides[get_db] = _override_get_db
    # Do NOT override get_current_user — requests without Bearer will get 403
    app.dependency_overrides.pop(get_current_user, None)

    with TestClient(app, raise_server_exceptions=False, headers={"X-App-Version": "99.0.0"}) as c:
        yield c

    app.dependency_overrides.clear()


# ── Factory helpers ───────────────────────────────────────────────────────────


def make_user(db: Session, user_id: str = TEST_USER_ID) -> None:
    """Insert a user row into the test database."""
    from app.models.user import User

    user = User(id=user_id, username=f"testuser-{user_id[:8]}")
    db.add(user)
    db.commit()


def make_account(
    db: Session,
    user_id: str = TEST_USER_ID,
    *,
    balance: int = 0,
    institution: str = "Test Bank",
    bank_slug: str = "testbank",
) -> str:
    """Create a bank account and return its ID."""
    from app.models.bank_account import BankAccount

    account_id = str(uuid.uuid4())
    acct = BankAccount(
        id=account_id,
        user_id=user_id,
        institution=institution,
        bank_slug=bank_slug,
        account_name="Test Account",
        alias="Test",
        account_number="1234567890",
        account_type="SAVINGS",
        currency="NGN",
        balance=balance,
        starting_balance=0,
    )
    db.add(acct)
    db.commit()
    return account_id


def make_group(
    db: Session,
    user_id: str = TEST_USER_ID,
    name: str = "Test Group",
    sort_order: int = 0,
) -> str:
    """Create a category group and return its ID."""
    from app.models.category import CategoryGroup

    group_id = str(uuid.uuid4())
    group = CategoryGroup(
        id=group_id,
        user_id=user_id,
        name=name,
        sort_order=sort_order,
    )
    db.add(group)
    db.commit()
    return group_id


def make_category(
    db: Session,
    group_id: str,
    user_id: str = TEST_USER_ID,
    name: str = "Test Category",
    sort_order: int = 0,
) -> str:
    """Create a category and return its ID."""
    from app.models.category import Category

    cat_id = str(uuid.uuid4())
    cat = Category(
        id=cat_id,
        user_id=user_id,
        group_id=group_id,
        name=name,
        sort_order=sort_order,
    )
    db.add(cat)
    db.commit()
    return cat_id


def make_transaction(
    db: Session,
    user_id: str,
    account_id: str,
    *,
    amount: int = -5000,
    tx_type: str = "debit",
    category_id: str | None = None,
    narration: str = "Test transaction",
    date: datetime | None = None,
    source: str = "manual",
) -> str:
    """Create a transaction and return its ID."""
    from app.models.transaction import Transaction, TransactionSource

    tx_id = str(uuid.uuid4())
    tx = Transaction(
        id=tx_id,
        user_id=user_id,
        account_id=account_id,
        date=date or datetime.now(UTC),
        amount=amount,
        narration=narration,
        cleaned_narration=narration.lower().strip(),
        type=tx_type,
        category_id=category_id,
        source=TransactionSource(source),
    )
    db.add(tx)
    db.commit()
    return tx_id


def make_budget_month(
    db: Session,
    user_id: str,
    category_id: str,
    month: str,
    *,
    assigned: int = 0,
    activity: int = 0,
    carried_over: int = 0,
) -> str:
    """Create a budget month row and return its ID."""
    from app.models.budget import BudgetMonth
    from app.services.budget_logic import str_to_month_date

    bm_id = str(uuid.uuid4())
    bm = BudgetMonth(
        id=bm_id,
        user_id=user_id,
        category_id=category_id,
        month=str_to_month_date(month),
        assigned=assigned,
        activity=activity,
        carried_over=carried_over,
    )
    db.add(bm)
    db.commit()
    return bm_id
