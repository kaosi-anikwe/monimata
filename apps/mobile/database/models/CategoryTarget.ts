import { Model } from '@nozbe/watermelondb'
import { field, text, readonly, date } from '@nozbe/watermelondb/decorators'

export default class CategoryTarget extends Model {
  static table = 'category_targets'

  @text('category_id') categoryId!: string
  /** "weekly" | "monthly" | "yearly" | "custom" */
  @text('frequency') frequency!: string
  /** "set_aside" | "refill" | "balance" */
  @text('behavior') behavior!: string
  @field('target_amount') targetAmount!: number
  @field('day_of_week') dayOfWeek!: number | null
  @field('day_of_month') dayOfMonth!: number | null
  /** ISO date string "YYYY-MM-DD" — yearly / custom due date */
  @text('target_date') targetDate!: string | null
  /** custom frequency only — weekly/monthly/yearly always repeat */
  @field('repeats') repeats!: boolean
  @readonly @date('created_at') createdAt!: Date
  @date('updated_at') updatedAt!: Date
}
