import type { Expense } from '../types';

export const calculateBalance = (expenses: Expense[]): number => {
  if (!Array.isArray(expenses)) return 0;
  return expenses.reduce((sum, exp) => {
    if (!exp) return sum;
    const val = typeof exp.amount === 'number' ? exp.amount : parseFloat(String(exp.amount));
    return sum + (isNaN(val) || val <= 0 ? 0 : val);
  }, 0);
};
