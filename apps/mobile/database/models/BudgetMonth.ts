import { Model } from '@nozbe/watermelondb'
import { date, field, text } from '@nozbe/watermelondb/decorators'

export default class BudgetMonth extends Model {
  static table = 'budget_months'

  @text('user_id') userId!: string
  @text('category_id') categoryId!: string
  @text('month') month!: string
  @field('assigned') assigned!: number
  @field('activity') activity!: number
  @field('carried_over') carriedOver!: number
  @date('updated_at') updatedAt!: Date

  get available(): number {
    return this.carriedOver + this.assigned + this.activity
  }
}
