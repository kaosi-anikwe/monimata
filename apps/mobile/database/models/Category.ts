import { Model } from '@nozbe/watermelondb'
import { field, text, readonly, date } from '@nozbe/watermelondb/decorators'

export default class Category extends Model {
  static table = 'categories'

  @text('user_id') userId!: string
  @text('group_id') groupId!: string
  @text('name') name!: string
  @field('sort_order') sortOrder!: number
  @field('is_hidden') isHidden!: boolean
  @readonly @date('created_at') createdAt!: Date
  @date('updated_at') updatedAt!: Date
}
