import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { versionApi } from '../services/api';
import { DiffViewer } from '../components/DiffViewer';
import toast from 'react-hot-toast';


export const VersionComparisonPage: React.FC = () => {
  const { resumeId, versionId } = useParams<{ resumeId: string; versionId: string }>();
  const [comparison, setComparison] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (resumeId && versionId) {
      loadComparison(resumeId, versionId);
    }
  }, [resumeId, versionId]);

  const loadComparison = async (rId: string, vId: string) => {
    try {
      setIsLoading(true);
      const res = await versionApi.compareVersion(rId, vId);
      setComparison(res.data.data);
    } catch {
      toast.error('Failed to load version comparison.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async (format: 'pdf' | 'docx') => {
    try {
      if (!resumeId || !versionId) return;
      toast.loading(`Downloading ${format.toUpperCase()}...`, { id: 'dl' });
      const res = await versionApi.downloadVersion(resumeId, versionId, format);
      const blob = new Blob([res.data], {
        type: format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Resume_v${comparison?.versionNumber || 1}_Optimized.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Download complete!', { id: 'dl' });
    } catch {
      toast.error('Failed to download document.', { id: 'dl' });
    }
  };

  if (isLoading) {
    return <div className="py-20 text-center text-slate-500">Loading version diff...</div>;
  }

  if (!comparison) {
    return <div className="py-20 text-center text-slate-500">Comparison not found.</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-sky-600 uppercase tracking-wider">
            <span>Version Comparison</span>
            <span>•</span>
            <span className="text-slate-500">Version {comparison.versionNumber} vs Original</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            Changelog & ATS Score Impact
          </h1>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => handleDownload('pdf')}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-sm"
          >
            Download PDF
          </button>
          <button
            onClick={() => handleDownload('docx')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm"
          >
            Download DOCX
          </button>
          <Link
            to={`/resumes/${resumeId}`}
            className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium"
          >
            Back to Resume
          </Link>
        </div>
      </div>

      {/* Score Comparison Bar */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center space-x-8">
          <div>
            <span className="text-xs text-slate-500 uppercase font-semibold block">Baseline Score</span>
            <span className="text-2xl font-bold text-slate-700">{comparison.beforeScore}%</span>
          </div>
          <div className="text-xl text-slate-400 font-bold">→</div>
          <div>
            <span className="text-xs text-emerald-700 uppercase font-semibold block">Rescored Version</span>
            <span className="text-2xl font-bold text-emerald-800">{comparison.afterScore}%</span>
          </div>
          <div className="px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold rounded-lg text-sm">
            {comparison.scoreDelta >= 0 ? `+${comparison.scoreDelta}%` : `${comparison.scoreDelta}%`}
          </div>
        </div>

        {comparison.addedKeywords && comparison.addedKeywords.length > 0 && (
          <div>
            <span className="text-xs text-slate-500 font-semibold block mb-1.5">Added Target Keywords:</span>
            <div className="flex flex-wrap gap-1">
              {comparison.addedKeywords.map((k: string, i: number) => (
                <span key={i} className="text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded">
                  +{k}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Detailed Diff */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-slate-900">Modified Content Items</h2>
        <DiffViewer changes={comparison.changes} />
      </div>
    </div>
  );
};
