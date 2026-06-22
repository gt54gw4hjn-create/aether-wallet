import type { Expense } from '../types';

export const calculateBalance = (expenses: Expense[]): number => {
  if (!Array.isArray(expenses)) return 0;
  return expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
};
