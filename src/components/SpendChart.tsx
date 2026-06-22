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
}

const SpendChart: React.FC<SpendChartProps> = ({ catTotals, isDarkMode }) => {
  const panelBg = isDarkMode ? 'rgba(30,41,59,0.55)' : 'rgba(255,255,255,0.6)';
  const panelBorder = isDarkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
  const trackBg = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const labelColor = isDarkMode ? '#94a3b8' : '#64748b';
  const valueColor = isDarkMode ? '#f1f5f9' : '#1e293b';

  const maxTotal = Math.max(...catTotals.map((c) => c.total), 1);
  const sorted = [...catTotals].sort((a, b) => b.total - a.total);

  return (
    <div
      style={{
        background: panelBg,
        border: `1px solid ${panelBorder}`,
        borderRadius: '1.25rem',
        padding: '1rem',
        backdropFilter: 'blur(10px)',
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
          const pct = (cat.total / maxTotal) * 100;
          return (
            <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              {/* Icon */}
              <div style={{
                width: '28px', height: '28px', borderRadius: '8px',
                background: cat.color + '22',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: '14px', color: cat.color }}>{cat.icon}</span>
              </div>

              {/* Label + bar */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: valueColor }}>{cat.label}</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: cat.color }}>
                    RM{cat.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                {/* Track */}
                <div style={{ width: '100%', height: '5px', borderRadius: '99px', background: trackBg }}>
                  <div style={{
                    height: '5px', borderRadius: '99px',
                    width: `${pct}%`,
                    background: cat.color,
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
