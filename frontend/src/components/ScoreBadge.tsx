import React from 'react';

interface ScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export const ScoreBadge: React.FC<ScoreBadgeProps> = ({
  score,
  size = 'md',
  showLabel = true,
}) => {
  const rounded = Math.round(score * 10) / 10;

  let colorClasses = 'bg-rose-50 text-rose-700 border-rose-200';
  let badgeLabel = 'Needs Work';

  if (rounded >= 80) {
    colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    badgeLabel = 'Strong Match';
  } else if (rounded >= 60) {
    colorClasses = 'bg-amber-50 text-amber-700 border-amber-200';
    badgeLabel = 'Moderate Match';
  }

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1 font-semibold',
    lg: 'text-xl px-4 py-2 font-bold',
  }[size];

  return (
    <div className="inline-flex items-center space-x-2">
      <span className={`inline-flex items-center rounded-full border ${colorClasses} ${sizeClasses}`}>
        {rounded}%
      </span>
      {showLabel && (
        <span className="text-xs font-medium text-slate-500">
          ({badgeLabel})
        </span>
      )}
    </div>
  );
};
