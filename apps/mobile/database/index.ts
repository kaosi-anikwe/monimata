import { Database } from '@nozbe/watermelondb'
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite'
import { addColumns, createTable, schemaMigrations, unsafeExecuteSql } from '@nozbe/watermelondb/Schema/migrations'
import { randomUUID } from 'expo-crypto'

import { getOrCreateDbKey } from './encryption'
import BudgetMonth from './models/BudgetMonth'
import Category from './models/Category'
import CategoryGroup from './models/CategoryGroup'
import CategoryTarget from './models/CategoryTarget'
import RecurringRule from './models/RecurringRule'
import Transaction from './models/Transaction'
import { schema } from './schema'

// Override WatermelonDB's default ID generator (base-36 random strings like
// "H35OjG2Jz2NU8M7J") so it produces UUID v4 strings instead.  PostgreSQL
// expects UUID primary keys; this mismatch caused sync push failures.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { setGenerator } = require('@nozbe/watermelondb/utils/common/randomId') as {
  setGenerator: (fn: () => string) => void;
};
setGenerator(() => randomUUID());

// Migrations run once on each device when the schema version increases.
// Every new schema version MUST have a corresponding migration step here.
const migrations = schemaMigrations({
  migrations: [
    {
      // v1 → v2: add updated_at to category_groups and categories
      toVersion: 2,
      steps: [
        addColumns({
          table: 'category_groups',
          columns: [{ name: 'updated_at', type: 'number' }],
        }),
        addColumns({
          table: 'categories',
          columns: [{ name: 'updated_at', type: 'number' }],
        }),
      ],
    },
    {
      // v2 → v3: add recurrence_id to transactions; add category_targets and recurring_rules
      toVersion: 3,
      steps: [
        addColumns({
          table: 'transactions',
          columns: [{ name: 'recurrence_id', type: 'string', isOptional: true }],
        }),
        createTable({
          name: 'category_targets',
          columns: [
            { name: 'category_id', type: 'string', isIndexed: true },
            { name: 'frequency', type: 'string' },
            { name: 'behavior', type: 'string' },
            { name: 'target_amount', type: 'number' },
            { name: 'day_of_week', type: 'number', isOptional: true },
            { name: 'day_of_month', type: 'number', isOptional: true },
            { name: 'target_date', type: 'string', isOptional: true },
            { name: 'repeats', type: 'boolean' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'recurring_rules',
          columns: [
            { name: 'user_id', type: 'string' },
            { name: 'frequency', type: 'string' },
            { name: 'interval', type: 'number' },
            { name: 'day_of_week', type: 'number', isOptional: true },
            { name: 'day_of_month', type: 'number', isOptional: true },
            { name: 'next_due', type: 'string' },
            { name: 'ends_on', type: 'string', isOptional: true },
            { name: 'is_active', type: 'boolean' },
            { name: 'template', type: 'string' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      // v3 → v4: transactions.date promoted from string (YYYY-MM-DD) to number
      // (epoch-ms TIMESTAMPTZ).  SQLite cannot ALTER COLUMN type, so we drop and
      // recreate the transactions table.  WatermelonDB is a local cache — all
      // data re-syncs on the next pull.
      toVersion: 4,
      steps: [
        // Drop existing indexes before dropping the table
        unsafeExecuteSql('DROP INDEX IF EXISTS "transactions_account_id";'),
        unsafeExecuteSql('DROP INDEX IF EXISTS "transactions_category_id";'),
        unsafeExecuteSql('DROP INDEX IF EXISTS "transactions_recurrence_id";'),
        unsafeExecuteSql('DROP TABLE IF EXISTS "transactions";'),
        unsafeExecuteSql(`
          CREATE TABLE "transactions" (
            "id" TEXT PRIMARY KEY NOT NULL,
            "account_id" TEXT NOT NULL DEFAULT '',
            "user_id" TEXT NOT NULL DEFAULT '',
            "mono_id" TEXT,
            "date" REAL NOT NULL DEFAULT 0,
            "amount" REAL NOT NULL DEFAULT 0,
            "narration" TEXT NOT NULL DEFAULT '',
            "type" TEXT NOT NULL DEFAULT '',
            "balance_after" REAL,
            "category_id" TEXT,
            "memo" TEXT,
            "is_split" INTEGER NOT NULL DEFAULT 0,
            "is_manual" INTEGER NOT NULL DEFAULT 0,
            "source" TEXT NOT NULL DEFAULT '',
            "recurrence_id" TEXT,
            "created_at" REAL NOT NULL DEFAULT 0,
            "updated_at" REAL NOT NULL DEFAULT 0,
            "_status" TEXT,
            "_changed" TEXT
          );
        `),
        unsafeExecuteSql('CREATE INDEX "transactions_account_id" ON "transactions" ("account_id");'),
        unsafeExecuteSql('CREATE INDEX "transactions_category_id" ON "transactions" ("category_id");'),
        unsafeExecuteSql('CREATE INDEX "transactions_recurrence_id" ON "transactions" ("recurrence_id");'),
      ],
    },
  ],
})

// ── Lazy async database singleton ───────────────────────────────────────────
// The database must be initialised after the encryption key is available from
// the OS keychain. Call `initDatabase()` once in app/_layout.tsx before the
// React tree mounts, then use `getDatabase()` everywhere else.

let _db: Database | null = null;

/**
 * Initialises WatermelonDB with a SQLCipher encryption key.
 * Idempotent — safe to call multiple times; resolves immediately after first call.
 *
 * Must be awaited in app/_layout.tsx before rendering <DatabaseProvider>.
 */
export async function initDatabase(): Promise<Database> {
  if (_db) return _db;

  const encryptionKey = await getOrCreateDbKey();

  const adapter = new SQLiteAdapter({
    schema,
    migrations,
    dbName: 'monimata',
    jsi: true,
    // encryptionKey is a runtime SQLCipher option not yet reflected in the
    // @nozbe/watermelondb TypeScript definitions; cast to any to pass it.
    ...({ encryptionKey } as any),
    onSetUpError: (error) => {
      console.error('[WatermelonDB] setup error', error);
    },
  });

  _db = new Database({
    adapter,
    modelClasses: [CategoryGroup, Category, Transaction, BudgetMonth, CategoryTarget, RecurringRule],
  });

  return _db;
}

/**
 * Synchronous getter. Throws if `initDatabase()` has not yet resolved.
 * Use this in database/sync.ts and anywhere that accesses the db after init.
 */
export function getDatabase(): Database {
  if (!_db) {
    throw new Error(
      '[MoniMata] Database not initialized. ' +
      'Ensure initDatabase() is awaited in app/_layout.tsx before rendering.'
    );
  }
  return _db;
}
