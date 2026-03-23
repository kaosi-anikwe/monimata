import { Model } from '@nozbe/watermelondb'
import { field, text, readonly, date } from '@nozbe/watermelondb/decorators'

export default class RecurringRule extends Model {
  static table = 'recurring_rules'

  @text('user_id') userId!: string
  /** "daily" | "weekly" | "biweekly" | "monthly" | "yearly" | "custom" */
  @text('frequency') frequency!: string
  /** Every N units of frequency */
  @field('interval') interval!: number
  @field('day_of_week') dayOfWeek!: number | null
  @field('day_of_month') dayOfMonth!: number | null
  /** ISO date "YYYY-MM-DD" — next transaction to generate */
  @text('next_due') nextDue!: string
  /** ISO date "YYYY-MM-DD" — optional hard stop */
  @text('ends_on') endsOn!: string | null
  @field('is_active') isActive!: boolean
  /** JSON-encoded transaction template */
  @text('template') template!: string
  @readonly @date('created_at') createdAt!: Date
  @date('updated_at') updatedAt!: Date
}
