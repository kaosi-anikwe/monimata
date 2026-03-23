import { Model } from '@nozbe/watermelondb'
import { field, text, readonly, date } from '@nozbe/watermelondb/decorators'

export default class Transaction extends Model {
  static table = 'transactions'

  @text('account_id') accountId!: string
  @text('user_id') userId!: string
  @text('mono_id') monoId!: string | null
  @date('date') date!: Date
  @field('amount') amount!: number
  @text('narration') narration!: string
  @text('type') type!: string
  @field('balance_after') balanceAfter!: number | null
  @text('category_id') categoryId!: string | null
  @text('memo') memo!: string | null
  @field('is_split') isSplit!: boolean
  @field('is_manual') isManual!: boolean
  @text('source') source!: string
  @text('recurrence_id') recurrenceId!: string | null
  @readonly @date('created_at') createdAt!: Date
  @date('updated_at') updatedAt!: Date
}
