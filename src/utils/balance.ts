import type { Expense } from '../types';

export const calculateBalance = (expenses: Expense[]): number => {
  if (!Array.isArray(expenses)) return 0;
  return expenses.reduce((sum, exp) => {
    const val = typeof exp.amount === 'string' ? parseFloat(exp.amount) : exp.amount;
    return sum + (Number.isNaN(val) || !val ? 0 : val);
  }, 0);
};
