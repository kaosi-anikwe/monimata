import { Model } from '@nozbe/watermelondb'
import { field, text, readonly, date } from '@nozbe/watermelondb/decorators'

export default class CategoryGroup extends Model {
  static table = 'category_groups'

  @text('user_id') userId!: string
  @text('name') name!: string
  @field('sort_order') sortOrder!: number
  @field('is_hidden') isHidden!: boolean
  @readonly @date('created_at') createdAt!: Date
  @date('updated_at') updatedAt!: Date
}
