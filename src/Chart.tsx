import { useMemo } from 'react';

interface ChartProps {
  expenses: { amount: number; categoryId: string }[];
  categories: { id: string; color: string }[];
  filterCategory?: string | null;
  onCategoryClick?: (id: string) => void;
}

export default function DonutChart({ expenses, categories, filterCategory, onCategoryClick }: ChartProps) {
  const data = useMemo(() => {
    const totals: Record<string, number> = {};
    let grandTotal = 0;
    
    expenses.forEach(exp => {
      totals[exp.categoryId] = (totals[exp.categoryId] || 0) + exp.amount;
      grandTotal += exp.amount;
    });

    if (grandTotal === 0) return [];

    let currentOffset = 0;
    return categories.map(cat => {
      const amount = totals[cat.id] || 0;
      const percentage = (amount / grandTotal) * 100;
      const offset = currentOffset;
      currentOffset += percentage;
      
      return {
        ...cat,
        percentage,
        offset,
        amount
      };
    }).filter(d => d.percentage > 0);
  }, [expenses, categories]);

  if (data.length === 0) {
    return (
      <div className="w-16 h-16 rounded-full border-4 border-slate-100 flex items-center justify-center transition-all">
        <span className="text-slate-300 material-symbols-outlined text-xl">pie_chart</span>
      </div>
    );
  }

  return (
    <svg width="64" height="64" viewBox="0 0 36 36" className="transform -rotate-90 drop-shadow-md">
      {/* Background ring */}
      <circle cx="18" cy="18" r="15.9155" fill="transparent" stroke="currentColor" className="text-slate-100/10" strokeWidth="4" />
      
      {/* Segments */}
      {data.map((segment) => {
        const isFaded = filterCategory && filterCategory !== segment.id;
        return (
          <circle
            key={segment.id}
            cx="18"
            cy="18"
            r="15.9155"
            fill="transparent"
            stroke={segment.color}
            strokeWidth={filterCategory === segment.id ? "5" : "4"}
            strokeDasharray={`${segment.percentage} ${100 - segment.percentage}`}
            strokeDashoffset={-segment.offset}
            onClick={() => onCategoryClick && onCategoryClick(segment.id)}
            className={`transition-all duration-300 ease-out cursor-pointer hover:stroke-[5px] ${isFaded ? 'opacity-20' : 'opacity-100'}`}
          />
        );
      })}
    </svg>
  );
}
