"""
Outbound email via SMTP.

All settings are read from app.core.config.settings (populated from .env).
The sender is always SMTP_FROM so callers only specify recipients and content.
"""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


def send_email(
    to: str | list[str],
    subject: str,
    body: str,
    *,
    html: str | None = None,
) -> bool:
    """
    Send a plain-text (and optionally HTML) email via SMTP.

    Returns True on success, False on failure.  Never raises — caller can
    treat a False return as a soft error.
    """
    if not all(
        [settings.SMTP_HOST, settings.SMTP_USERNAME, settings.SMTP_PASSWORD, settings.SMTP_FROM]
    ):
        logger.error("send_email: SMTP is not configured — skipping")
        return False

    recipients = [to] if isinstance(to, str) else to

    msg = EmailMessage()
    msg["From"] = settings.SMTP_FROM
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = subject
    msg.set_content(body)
    if html:
        msg.add_alternative(html, subtype="html")

    try:
        if settings.SMTP_USE_TLS:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
                smtp.ehlo()
                smtp.starttls()
                smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
                smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                smtp.send_message(msg)

        logger.info("send_email: sent '%s' to %s", subject, recipients)
        return True

    except smtplib.SMTPAuthenticationError:
        logger.error("send_email: SMTP authentication failed")
    except smtplib.SMTPException as exc:
        logger.error("send_email: SMTP error — %s", exc)
    except OSError as exc:
        logger.error("send_email: network error — %s", exc)

    return False
