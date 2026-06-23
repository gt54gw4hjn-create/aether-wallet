import React from 'react';

interface InsightStripProps {
  dailyAvg: number;
  peakDay: string | null;
  thisMonthTotal: number;
  isDarkMode: boolean;
  currencySymbol?: string;
}

const InsightStrip: React.FC<InsightStripProps> = ({ dailyAvg, peakDay, thisMonthTotal, isDarkMode, currencySymbol = 'RM' }) => {
  const panelBg = isDarkMode ? 'rgba(30,41,59,0.55)' : 'rgba(255,255,255,0.6)';
  const panelBorder = isDarkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
  const labelColor = isDarkMode ? '#64748b' : '#94a3b8';
  const valueColor = isDarkMode ? '#f1f5f9' : '#0f172a';

  const tiles = [
    {
      icon: 'today',
      iconColor: '#6366f1',
      label: 'Daily Avg',
      value: `${currencySymbol}${dailyAvg.toFixed(2)}`,
    },
    {
      icon: 'trending_up',
      iconColor: '#10b981',
      label: 'This Month',
      value: `${currencySymbol}${thisMonthTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    },
    {
      icon: 'event',
      iconColor: '#f59e0b',
      label: 'Peak Day',
      value: peakDay ?? 'N/A',
    },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
      {tiles.map((t) => (
        <div
          key={t.label}
          style={{
            background: panelBg,
            border: `1px solid ${panelBorder}`,
            borderRadius: '1rem',
            padding: '0.75rem 0.6rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.3rem',
            backdropFilter: 'blur(10px)',
            transition: 'transform 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '14px', color: t.iconColor }}>{t.icon}</span>
            <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: labelColor }}>
              {t.label}
            </span>
          </div>
          <span style={{ fontSize: '0.82rem', fontWeight: 800, color: valueColor, lineHeight: 1.2 }}>
            {t.value}
          </span>
        </div>
      ))}
    </div>
  );
};

export default InsightStrip;
