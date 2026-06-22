import { useMemo, memo } from 'react';

interface SparklineProps {
  expenses: { amount: number; date: string }[];
  isDarkMode: boolean;
}

const Sparkline = memo(function Sparkline({ expenses, isDarkMode }: SparklineProps) {
  const dataPoints = useMemo(() => {
    if (!expenses || expenses.length === 0) return { pathString: '', values: [] };
    
    // Get last 7 days
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const last7Days = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (6 - i));
      // Format as YYYY-MM-DD or local format depending on how expenses are saved.
      // Expenses date is saved as `toLocaleDateString()`
      return d.toLocaleDateString();
    });

    // Sum amounts per day
    const dailyTotals: Record<string, number> = {};
    expenses.forEach(exp => {
      // the expense date is already localized string
      dailyTotals[exp.date] = (dailyTotals[exp.date] || 0) + exp.amount;
    });

    const values = last7Days.map(date => dailyTotals[date] || 0);
    
    const maxVal = Math.max(...values, 1); // Avoid div by 0
    const minVal = Math.min(...values);

    const width = 200;
    const height = 40;
    const padding = 5;
    
    const points = values.map((val, i) => {
      const x = (i / 6) * (width - padding * 2) + padding;
      const y = height - padding - ((val - minVal) / (maxVal - minVal + 0.1)) * (height - padding * 2);
      return `${x},${y}`;
    });

    // Create a smooth curve using bezier paths (simple approximation)
    const pathString = `M ${points.join(' L ')}`;
    return { pathString, values };
  }, [expenses]);

  if (!dataPoints.pathString) return null;

  return (
    <div className="flex flex-col items-center justify-center mt-4">
      <div className="text-[10px] uppercase font-bold tracking-wider mb-1 opacity-50">7-Day Trend</div>
      <svg width="200" height="40" viewBox="0 0 200 40" className="overflow-visible">
        <path 
          d={dataPoints.pathString} 
          fill="none" 
          stroke={isDarkMode ? '#818cf8' : '#6366f1'} 
          strokeWidth="3" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          className="drop-shadow-md"
        />
        {/* Draw dots */}
        {dataPoints.pathString && dataPoints.pathString.split(' L ').map((point: string, i: number) => {
          const [x, y] = point.replace('M ', '').split(',');
          return (
            <circle 
              key={i} 
              cx={x} 
              cy={y} 
              r="3" 
              fill={isDarkMode ? '#1e293b' : '#ffffff'} 
              stroke={isDarkMode ? '#818cf8' : '#6366f1'} 
              strokeWidth="2" 
            />
          );
        })}
      </svg>
    </div>
  );
});

export default Sparkline;
