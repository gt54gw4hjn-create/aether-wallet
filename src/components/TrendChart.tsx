import React from 'react';
import type { Expense } from '../types';

interface TrendChartProps {
  expenses: Expense[];
  isDarkMode: boolean;
  currencySymbol: string;
}

const TrendChart: React.FC<TrendChartProps> = ({ expenses, isDarkMode, currencySymbol }) => {
  const panelBg = isDarkMode ? 'rgba(30,41,59,0.55)' : 'rgba(255,255,255,0.6)';
  const panelBorder = isDarkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
  const labelColor = isDarkMode ? '#94a3b8' : '#64748b';
  const valueColor = isDarkMode ? '#f1f5f9' : '#1e293b';

  // 1. Generate last 7 days
  const dates = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // 2. Sum up expenses for each day (excluding future or non-matching dates)
  const dailyTotals = dates.map(date => {
    const dateStr = date.toISOString().split('T')[0];
    const total = expenses
      .filter(e => e.date === dateStr)
      .reduce((sum, e) => sum + e.amount, 0);
    
    // Format label as "Mon 15"
    const dayLabel = date.toLocaleDateString('en-US', { weekday: 'short' });
    const dayNum = date.getDate();
    return {
      dateLabel: `${dayLabel} ${dayNum}`,
      dateStr,
      total
    };
  });

  const maxVal = Math.max(...dailyTotals.map(d => d.total), 10);

  // 3. Map to SVG coordinates (width=300, height=130)
  // X range: 25 to 275 (width=250)
  // Y range: 20 to 95 (height=75)
  const points = dailyTotals.map((d, i) => {
    const x = 25 + i * (250 / 6);
    const y = 95 - (d.total / maxVal) * 70;
    return { x, y };
  });

  // Construct smooth cubic bezier curve
  let linePath = '';
  if (points.length > 0) {
    linePath = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const cp1x = points[i].x + (points[i + 1].x - points[i].x) / 3;
      const cp1y = points[i].y;
      const cp2x = points[i].x + 2 * (points[i + 1].x - points[i].x) / 3;
      const cp2y = points[i + 1].y;
      linePath += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${points[i + 1].x} ${points[i + 1].y}`;
    }
  }

  const areaPath = points.length > 0 
    ? `${linePath} L ${points[points.length - 1].x} 105 L ${points[0].x} 105 Z` 
    : '';

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
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#6366f1' }}>trending_up</span>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: labelColor }}>
          Weekly Spending Trend
        </span>
      </div>

      {/* SVG Chart */}
      <div style={{ position: 'relative', width: '100%' }}>
        <svg viewBox="0 0 300 135" style={{ width: '100%', height: 'auto', display: 'block' }}>
          <defs>
            <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.00" />
            </linearGradient>
          </defs>

          {/* Grid lines (horizontal) */}
          <line x1="25" y1="95" x2="275" y2="95" stroke={isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} strokeWidth="1" />
          <line x1="25" y1="60" x2="275" y2="60" stroke={isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} strokeWidth="1" strokeDasharray="3 3" />
          <line x1="25" y1="25" x2="275" y2="25" stroke={isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} strokeWidth="1" strokeDasharray="3 3" />

          {/* Area under the curve */}
          {areaPath && (
            <path d={areaPath} fill="url(#trendGrad)" />
          )}

          {/* Line curve */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="#6366f1"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          )}

          {/* Dots and Labels */}
          {points.map((pt, idx) => {
            const dataVal = dailyTotals[idx].total;
            return (
              <g key={idx}>
                {/* Glow under dot */}
                <circle cx={pt.x} cy={pt.y} r="6" fill="#6366f1" opacity="0.15" />
                
                {/* Main dot */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r="3.5"
                  fill={isDarkMode ? '#ffffff' : '#6366f1'}
                  stroke="#6366f1"
                  strokeWidth="1.5"
                />

                {/* Amount label above dot (if > 0) */}
                {dataVal > 0 && (
                  <text
                    x={pt.x}
                    y={pt.y - 8}
                    textAnchor="middle"
                    style={{
                      fontSize: '7.5px',
                      fontWeight: 700,
                      fill: valueColor,
                      fontFamily: 'inherit'
                    }}
                  >
                    {currencySymbol}{Math.round(dataVal)}
                  </text>
                )}

                {/* Date label on X-axis */}
                <text
                  x={pt.x}
                  y="120"
                  textAnchor="middle"
                  style={{
                    fontSize: '8px',
                    fontWeight: 600,
                    fill: labelColor,
                    fontFamily: 'inherit'
                  }}
                >
                  {dailyTotals[idx].dateLabel}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

export default TrendChart;
