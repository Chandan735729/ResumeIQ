import React from 'react';

export interface DiffItem {
  id: string;
  section: string;
  originalText: string;
  suggestedText: string;
  reason: string;
  evidence?: string[];
  isApplied: boolean;
  rejectionReason?: string;
}

interface DiffViewerProps {
  changes: DiffItem[];
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ changes }) => {
  if (!changes || changes.length === 0) {
    return (
      <div className="p-6 text-center text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
        No modifications proposed. Your resume content is already well-aligned!
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {changes.map((item, idx) => (
        <div
          key={item.id || idx}
          className={`p-4 rounded-lg border transition-all ${
            item.isApplied
              ? 'bg-white border-slate-200 shadow-sm'
              : 'bg-rose-50/50 border-rose-200'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <span className="uppercase text-xs font-semibold tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                {item.section}
              </span>
              <span className="text-xs text-slate-600 font-medium">
                {item.reason}
              </span>
            </div>
            {item.isApplied ? (
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                ✓ Guardrail Approved
              </span>
            ) : (
              <span className="text-xs font-semibold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
                ✕ Guardrail Blocked (Fact Violation)
              </span>
            )}
          </div>

          {/* Diff Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {/* Original */}
            <div className="p-3 rounded bg-slate-50 border border-slate-200 text-slate-700">
              <span className="block text-xs font-semibold text-slate-400 mb-1">
                ORIGINAL
              </span>
              <p className="line-through text-slate-500">{item.originalText}</p>
            </div>

            {/* Suggested */}
            <div
              className={`p-3 rounded border ${
                item.isApplied
                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                  : 'bg-rose-50/70 border-rose-200 text-rose-900'
              }`}
            >
              <span className="block text-xs font-semibold text-slate-400 mb-1">
                {item.isApplied ? 'OPTIMIZED PHRASING' : 'REJECTED SUGGESTION'}
              </span>
              <p className="font-medium">{item.suggestedText}</p>
            </div>
          </div>

          {/* Rejection notice if blocked */}
          {item.rejectionReason && (
            <div className="mt-2 text-xs text-rose-600 bg-rose-100/60 p-2 rounded border border-rose-200">
              <strong>Guardrail Reason:</strong> {item.rejectionReason}
            </div>
          )}

          {/* Evidence tags */}
          {item.evidence && item.evidence.length > 0 && (
            <div className="mt-2 flex items-center space-x-2">
              <span className="text-xs text-slate-400 font-medium">Evidenced from resume:</span>
              <div className="flex flex-wrap gap-1">
                {item.evidence.map((ev, i) => (
                  <span
                    key={i}
                    className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded"
                  >
                    {ev}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
