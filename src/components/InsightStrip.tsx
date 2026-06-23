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

  const renderFormattedValue = (value: string | number, label: string) => {
    if (label === 'Peak Day' || typeof value !== 'number') {
      return <span>{value}</span>;
    }
    const parts = value.toFixed(2).split('.');
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

  const tiles = [
    {
      icon: 'today',
      iconColor: '#6366f1',
      label: 'Daily Avg',
      value: dailyAvg,
    },
    {
      icon: 'trending_up',
      iconColor: '#10b981',
      label: 'This Month',
      value: thisMonthTotal,
    },
    {
      icon: 'event',
      iconColor: '#f59e0b',
      label: 'Peak Day',
      value: peakDay ?? 'N/A',
    },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', flexShrink: 0 }}>
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
            {renderFormattedValue(t.value, t.label)}
          </span>
        </div>
      ))}
    </div>
  );
};

export default InsightStrip;
