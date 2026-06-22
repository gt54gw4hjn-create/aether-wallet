export interface Category {
  id: string;
  label: string;
  icon: string;
  emoji: string;
  color: string;
}

export const CATEGORIES: Category[] = [
  { id: 'food', label: 'Food', icon: 'restaurant', emoji: '🍔', color: '#ff9500' }, 
  { id: 'coffee', label: 'Coffee', icon: 'local_cafe', emoji: '☕', color: '#a2845e' }, 
  { id: 'transport', label: 'Transit', icon: 'directions_car', emoji: '🚗', color: '#34c759' }, 
  { id: 'shopping', label: 'Shopping', icon: 'shopping_bag', emoji: '🛍️', color: '#007aff' }, 
  { id: 'entertainment', label: 'Fun', icon: 'sports_esports', emoji: '🎮', color: '#af52de' }, 
  { id: 'other', label: 'Other', icon: 'more_horiz', emoji: '✨', color: '#8e8e93' }, 
];

export interface Project {
  id: string;
  name: string;
  budget?: number;
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  date: string;
  time?: string;
  categoryId: string;
  hasReceipt?: boolean;
  scopeType?: 'one-off' | 'weekly' | 'monthly' | 'project';
  projectId?: string;
}

export interface QuickTemplate {
  id: string;
  emoji: string;
  title: string;
  amount: number;
  categoryId: string;
}
