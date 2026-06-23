import React from 'react';

interface CatTotal {
  id: string;
  label: string;
  icon: string;
  color: string;
  total: number;
}

interface SpendChartProps {
  catTotals: CatTotal[];
  isDarkMode: boolean;
  categoryBudgets?: Record<string, number>;
  currencySymbol?: string;
}

const SpendChart: React.FC<SpendChartProps> = ({ catTotals, isDarkMode, categoryBudgets = {}, currencySymbol = 'RM' }) => {
  const panelBg = isDarkMode ? 'rgba(30,41,59,0.55)' : 'rgba(255,255,255,0.6)';
  const panelBorder = isDarkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
  const trackBg = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const labelColor = isDarkMode ? '#94a3b8' : '#64748b';
  const valueColor = isDarkMode ? '#f1f5f9' : '#1e293b';

  const maxTotal = Math.max(...catTotals.map((c) => c.total), 1);
  const sorted = [...catTotals].sort((a, b) => b.total - a.total);

  const renderFormattedAmount = (amount: number) => {
    const parts = amount.toFixed(2).split('.');
    const intPart = parts[0];
    const decPart = parts[1];

    return (
      <span style={{ display: 'inline-flex', alignItems: 'baseline' }}>
        <span style={{ fontSize: '0.78em', opacity: 0.6, fontWeight: 600, marginRight: '1px', verticalAlign: 'baseline' }}>
          {currencySymbol}
        </span>
        <span style={{ fontWeight: 800 }}>
          {Number(intPart).toLocaleString('en-US')}
        </span>
        <span style={{ fontSize: '0.78em', opacity: 0.6, fontWeight: 700, verticalAlign: 'baseline' }}>
          .{decPart}
        </span>
      </span>
    );
  };

  return (
    <div
      style={{
        background: panelBg,
        border: `1px solid ${panelBorder}`,
        borderRadius: '1.25rem',
        padding: '1rem',
        backdropFilter: 'blur(10px)',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.85rem' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#6366f1' }}>bar_chart</span>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: labelColor }}>
          Spending by Category
        </span>
      </div>

      {/* Bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {sorted.map((cat) => {
          const limit = categoryBudgets[cat.id] || 0;
          const hasLimit = limit > 0;
          const pct = hasLimit ? Math.min((cat.total / limit) * 100, 100) : (cat.total / maxTotal) * 100;
          
          // Color coding based on budget limits
          const barColor = hasLimit
            ? (cat.total >= limit ? '#ef4444' : cat.total >= limit * 0.8 ? '#f59e0b' : cat.color)
            : cat.color;

          return (
            <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              {/* Icon */}
              <div style={{
                width: '28px', height: '28px', borderRadius: '8px',
                background: barColor + '22',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: '14px', color: barColor }}>{cat.icon}</span>
              </div>

              {/* Label + bar */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: valueColor }}>{cat.label}</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: barColor }}>
                    {renderFormattedAmount(cat.total)}
                    {hasLimit && (
                      <span style={{ fontWeight: 500, fontSize: '0.65rem', opacity: 0.6, marginLeft: '4px' }}>
                        / <span style={{ fontSize: '0.85em', marginRight: '1px' }}>{currencySymbol}</span>{limit.toLocaleString('en-US')}
                      </span>
                    )}
                  </span>
                </div>
                {/* Track */}
                <div style={{ width: '100%', height: '5px', borderRadius: '99px', background: trackBg }}>
                  <div style={{
                    height: '5px', borderRadius: '99px',
                    width: `${pct}%`,
                    background: barColor,
                    transition: 'width 0.7s cubic-bezier(0.16,1,0.3,1)',
                  }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SpendChart;
