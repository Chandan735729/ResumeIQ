import React from 'react';

export type SkillMatchStatus = 'matched' | 'partial' | 'missing' | 'neutral';

interface SkillPillProps {
  skill: string;
  status?: SkillMatchStatus;
  evidence?: string;
}

export const SkillPill: React.FC<SkillPillProps> = ({ skill, status = 'neutral', evidence }) => {
  const statusStyles: Record<SkillMatchStatus, string> = {
    matched: 'bg-emerald-50 text-emerald-700 border-emerald-300 font-medium',
    partial: 'bg-amber-50 text-amber-800 border-amber-300 font-medium',
    missing: 'bg-rose-50 text-rose-700 border-rose-300',
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  const statusIcons: Record<SkillMatchStatus, string> = {
    matched: '✓',
    partial: '≈',
    missing: '✕',
    neutral: '•',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs border ${statusStyles[status]} transition-all`}
      title={evidence ? `Evidence: ${evidence}` : undefined}
    >
      <span className="mr-1.5 opacity-80">{statusIcons[status]}</span>
      {skill}
    </span>
  );
};
