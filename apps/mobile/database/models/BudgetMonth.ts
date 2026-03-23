import { Model } from '@nozbe/watermelondb'
import { field, text, date } from '@nozbe/watermelondb/decorators'

export default class BudgetMonth extends Model {
  static table = 'budget_months'

  @text('user_id') userId!: string
  @text('category_id') categoryId!: string
  @text('month') month!: string
  @field('assigned') assigned!: number
  @field('activity') activity!: number
  @date('updated_at') updatedAt!: Date
}
