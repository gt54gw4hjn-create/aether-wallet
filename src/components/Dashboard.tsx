import React from 'react';
import BalanceCard from './BalanceCard';
import SpendChart from './SpendChart';
import InsightStrip from './InsightStrip';
import { calculateBalance } from '../utils/balance';
import { CATEGORIES } from '../types';
import type { Expense } from '../types';

interface DashboardProps {
  expenses: Expense[];
  isDarkMode: boolean;
  budgetLimit: number;
  children?: React.ReactNode; // Full renderExpenseItem list passed from App
}

const Dashboard: React.FC<DashboardProps> = ({ expenses, isDarkMode, budgetLimit, children }) => {
  const balance = calculateBalance(expenses);

  // ── Category totals for bar chart ─────────────────────────────────────────
  const catTotals = CATEGORIES.map((cat) => ({
    ...cat,
    total: expenses
      .filter((e) => e.categoryId === cat.id)
      .reduce((s, e) => s + e.amount, 0),
  })).filter((c) => c.total > 0);

  // ── Insights ──────────────────────────────────────────────────────────────
  const now = new Date();
  const thisMonthExp = expenses.filter((e) => {
    const d = new Date(e.date);
    return !isNaN(d.getTime()) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const mtdTotal = thisMonthExp.reduce((s, e) => s + e.amount, 0);
  const dailyAvg = mtdTotal / (now.getDate() || 1);

  const daySums = Array(7).fill(0);
  expenses.forEach((e) => {
    const d = new Date(e.date);
    if (!isNaN(d.getDay())) daySums[d.getDay()] += e.amount;
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
      className="flex-1 w-full overflow-y-auto custom-scrollbar"
      style={{
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        paddingBottom: '6rem',
        ...themeVars,
      }}
    >
      {/* Balance + budget card */}
      <BalanceCard
        balance={balance}
        budgetLimit={budgetLimit}
        budgetUsed={budgetUsed}
        isOverBudget={isOverBudget}
      />

      {/* Insight tiles */}
      {expenses.length > 0 && (
        <InsightStrip
          dailyAvg={dailyAvg}
          peakDay={daySums[peakDayIdx] > 0 ? dayNames[peakDayIdx] : null}
          thisMonthTotal={mtdTotal}
          isDarkMode={isDarkMode}
        />
      )}

      {/* Category bar chart */}
      {catTotals.length > 0 && (
        <SpendChart catTotals={catTotals} isDarkMode={isDarkMode} />
      )}

      {/* Full transaction list — rendered by App.tsx with all swipe/bulk features */}
      {children && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
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
