import { createSlice, PayloadAction } from '@reduxjs/toolkit'

function currentMonthStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

interface BudgetState {
  selectedMonth: string // "YYYY-MM"
}

const initialState: BudgetState = {
  selectedMonth: currentMonthStr(),
}

const budgetSlice = createSlice({
  name: 'budget',
  initialState,
  reducers: {
    setSelectedMonth(state, action: PayloadAction<string>) {
      state.selectedMonth = action.payload
    },
    prevMonth(state) {
      const [y, m] = state.selectedMonth.split('-').map(Number)
      const d = new Date(y, m - 2, 1)
      state.selectedMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    },
    nextMonth(state) {
      const [y, m] = state.selectedMonth.split('-').map(Number)
      const d = new Date(y, m, 1)
      state.selectedMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    },
    /**
     * Called when the app comes to the foreground. Advances selectedMonth to
     * the current calendar month if the device clock has moved past the stored
     * month (e.g. app was backgrounded in January and resumed in February).
     * Does NOT go backward — users browsing a future month are unaffected.
     */
    syncToCurrentMonth(state) {
      const current = currentMonthStr()
      if (state.selectedMonth < current) {
        state.selectedMonth = current
      }
    },
  },
})

export const { setSelectedMonth, prevMonth, nextMonth, syncToCurrentMonth } = budgetSlice.actions
export default budgetSlice.reducer
