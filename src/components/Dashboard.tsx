import React from 'react';
import BalanceCard from './BalanceCard';
import SpendChart from './SpendChart';
import InsightStrip from './InsightStrip';
import TrendChart from './TrendChart';
import { calculateBalance } from '../utils/balance';
import type { Category, Expense } from '../types';

// Robustly parse stored expense dates (ISO "2026-06-22" or legacy "22/6/2026" / "6/22/2026")
const parseDate = (dateStr: string): Date => {
  if (!dateStr) return new Date(NaN);
  const isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
  return new Date(dateStr);
};

interface DashboardProps {
  expenses: Expense[];
  isDarkMode: boolean;
  budgetLimit: number;
  categoryBudgets?: Record<string, number>;
  currency?: string;
  categories?: Category[];
  children?: React.ReactNode; // Full renderExpenseItem list passed from App
}

const Dashboard: React.FC<DashboardProps> = ({ 
  expenses, 
  isDarkMode, 
  budgetLimit, 
  categoryBudgets, 
  currency = 'MYR',
  categories = [],
  children 
}) => {
  const balance = calculateBalance(expenses);

  const getCurrencySymbol = (code: string) => {
    switch (code) {
      case 'USD': return '$';
      case 'EUR': return '€';
      case 'SGD': return 'S$';
      case 'GBP': return '£';
      case 'JPY': return '¥';
      case 'CNY': return '¥';
      default: return 'RM';
    }
  };
  const currencySymbol = getCurrencySymbol(currency);

  // ── Category totals for bar chart ─────────────────────────────────────────
  const catTotals = categories.map((cat) => ({
    ...cat,
    total: expenses
      .filter((e) => e.categoryId === cat.id)
      .reduce((s, e) => s + e.amount, 0),
  })).filter((c) => c.total > 0);

  // ── Insights ──────────────────────────────────────────────────────────────
  const now = new Date();
  const thisMonthExp = expenses.filter((e) => {
    const d = parseDate(e.date);
    return !isNaN(d.getTime()) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const mtdTotal = thisMonthExp.reduce((s, e) => s + e.amount, 0);
  const dailyAvg = mtdTotal / (now.getDate() || 1);

  const daySums = Array(7).fill(0);
  expenses.forEach((e) => {
    const d = parseDate(e.date);
    if (!isNaN(d.getTime())) daySums[d.getDay()] += e.amount;
  });
  const peakDayIdx = daySums.indexOf(Math.max(...daySums));
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // ── Budget progress ────────────────────────────────────────────────────────
  const budgetUsed = budgetLimit > 0 ? Math.min((balance / budgetLimit) * 100, 100) : 0;
  const isOverBudget = budgetLimit > 0 && balance >= budgetLimit * 0.9;

  // ── CSS theme vars for panels ──────────────────────────────────────────────
  const themeVars: React.CSSProperties = isDarkMode
    ? {
        ['--tx-label' as string]: 'rgba(148,163,184,1)',
        ['--tx-row-bg' as string]: 'rgba(30,41,59,0.6)',
        ['--tx-row-border' as string]: 'rgba(255,255,255,0.07)',
        ['--tx-title' as string]: '#f1f5f9',
        ['--tx-amount' as string]: '#f8fafc',
        ['--panel-bg' as string]: 'rgba(15,23,42,0.5)',
        ['--panel-border' as string]: 'rgba(255,255,255,0.07)',
        ['--label-color' as string]: '#94a3b8',
        ['--value-color' as string]: '#f1f5f9',
      }
    : {
        ['--tx-label' as string]: '#6b7280',
        ['--tx-row-bg' as string]: 'rgba(255,255,255,0.65)',
        ['--tx-row-border' as string]: 'rgba(0,0,0,0.06)',
        ['--tx-title' as string]: '#1e293b',
        ['--tx-amount' as string]: '#0f172a',
        ['--panel-bg' as string]: 'rgba(255,255,255,0.55)',
        ['--panel-border' as string]: 'rgba(0,0,0,0.06)',
        ['--label-color' as string]: '#64748b',
        ['--value-color' as string]: '#0f172a',
      };

  return (
    <div
      className="w-full"
      style={{
        padding: '1rem',
        paddingBottom: '6rem',
        ...themeVars,
      }}
    >
      {/* Balance + budget card */}
      <div style={{ marginBottom: '0.75rem' }}>
        <BalanceCard
          balance={balance}
          budgetLimit={budgetLimit}
          budgetUsed={budgetUsed}
          isOverBudget={isOverBudget}
          currencySymbol={currencySymbol}
        />
      </div>

      {/* Insight tiles */}
      {expenses.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <InsightStrip
            dailyAvg={dailyAvg}
            peakDay={daySums[peakDayIdx] > 0 ? dayNames[peakDayIdx] : null}
            thisMonthTotal={mtdTotal}
            isDarkMode={isDarkMode}
            currencySymbol={currencySymbol}
          />
        </div>
      )}

      {/* Historical Trend Chart */}
      {expenses.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <TrendChart
            expenses={expenses}
            isDarkMode={isDarkMode}
            currencySymbol={currencySymbol}
          />
        </div>
      )}

      {/* Category bar chart */}
      {catTotals.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <SpendChart catTotals={catTotals} isDarkMode={isDarkMode} categoryBudgets={categoryBudgets} currencySymbol={currencySymbol} />
        </div>
      )}

      {/* Full transaction list — rendered by App.tsx with all swipe/bulk features */}
      {children && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0', marginBottom: '0.75rem' }}>
          <p style={{
            margin: '0 0 0.5rem 0.25rem',
            fontSize: '0.65rem',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: isDarkMode ? '#64748b' : '#94a3b8',
          }}>All Transactions</p>
          {children}
        </div>
      )}

      {expenses.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', opacity: 0.35 }}>
          <span className="material-symbols-outlined" style={{ fontSize: '48px', display: 'block', marginBottom: '12px', color: '#6366f1' }}>receipt_long</span>
          <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>No transactions yet</p>
          <p style={{ margin: '4px 0 0', fontSize: '0.75rem' }}>Tap + to add your first expense</p>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
