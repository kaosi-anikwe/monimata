import { appSchema, tableSchema } from '@nozbe/watermelondb'

export const schema = appSchema({
  version: 4,
  tables: [
    tableSchema({
      name: 'category_groups',
      columns: [
        { name: 'user_id', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'sort_order', type: 'number' },
        { name: 'is_hidden', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'categories',
      columns: [
        { name: 'user_id', type: 'string' },
        { name: 'group_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'sort_order', type: 'number' },
        { name: 'is_hidden', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'transactions',
      columns: [
        { name: 'account_id', type: 'string', isIndexed: true },
        { name: 'user_id', type: 'string' },
        { name: 'mono_id', type: 'string', isOptional: true },
        { name: 'date', type: 'number' },
        { name: 'amount', type: 'number' },
        { name: 'narration', type: 'string' },
        { name: 'type', type: 'string' },
        { name: 'balance_after', type: 'number', isOptional: true },
        { name: 'category_id', type: 'string', isIndexed: true, isOptional: true },
        { name: 'memo', type: 'string', isOptional: true },
        { name: 'is_split', type: 'boolean' },
        { name: 'is_manual', type: 'boolean' },
        { name: 'source', type: 'string' },
        { name: 'recurrence_id', type: 'string', isIndexed: true, isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'budget_months',
      columns: [
        { name: 'user_id', type: 'string' },
        { name: 'category_id', type: 'string', isIndexed: true },
        { name: 'month', type: 'string' },
        { name: 'assigned', type: 'number' },
        { name: 'activity', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'category_targets',
      columns: [
        { name: 'category_id', type: 'string', isIndexed: true },
        // "weekly" | "monthly" | "yearly" | "custom"
        { name: 'frequency', type: 'string' },
        // "set_aside" | "refill" | "balance"
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
    tableSchema({
      name: 'recurring_rules',
      columns: [
        { name: 'user_id', type: 'string' },
        // "daily" | "weekly" | "biweekly" | "monthly" | "yearly" | "custom"
        { name: 'frequency', type: 'string' },
        { name: 'interval', type: 'number' },
        { name: 'day_of_week', type: 'number', isOptional: true },
        { name: 'day_of_month', type: 'number', isOptional: true },
        { name: 'next_due', type: 'string' },
        { name: 'ends_on', type: 'string', isOptional: true },
        { name: 'is_active', type: 'boolean' },
        // JSON-encoded template object
        { name: 'template', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
  ],
})
