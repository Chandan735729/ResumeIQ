import React, { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { optimizationApi, versionApi } from '../services/api';
import { DiffViewer } from '../components/DiffViewer';
import toast from 'react-hot-toast';

export const OptimizationPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const resumeId = searchParams.get('resumeId');
  const jobId = searchParams.get('jobId');

  const [optimizationType, setOptimizationType] = useState('ats_focused');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [result, setResult] = useState<any>(null);


  const handleRunOptimization = async () => {
    if (!resumeId || !jobId) {
      toast.error('Resume ID and Job ID are required to run optimization.');
      return;
    }

    setIsOptimizing(true);
    try {
      toast.loading('Running AI optimization & deterministic fact guardrails...', { id: 'opt' });
      const res = await optimizationApi.optimize({
        resumeId,
        jobDescriptionId: jobId,
        optimizationType,
      });
      setResult(res.data.data);
      toast.success('Resume optimized, rescored, and documents generated!', { id: 'opt' });
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Optimization failed. Please try again.';
      toast.error(msg, { id: 'opt' });
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleDownload = async (versionId: string, format: 'pdf' | 'docx') => {
    try {
      if (!resumeId) return;
      toast.loading(`Downloading ${format.toUpperCase()}...`, { id: 'dl' });
      const res = await versionApi.downloadVersion(resumeId, versionId, format);
      const blob = new Blob([res.data], {
        type: format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Optimized_Resume_${format.toUpperCase()}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Download complete!', { id: 'dl' });
    } catch {
      toast.error('Failed to download document.', { id: 'dl' });
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-sky-600 uppercase tracking-wider">
            <span>Guarded AI Optimization</span>
            <span>•</span>
            <span className="text-slate-400">optimization-v1</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            Safe AI Resume Phrasing Optimizer
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Improves active verbs, terminology alignment, and ATS readiness while strictly enforcing existing candidate facts.
          </p>
        </div>

        {!result && (
          <div className="flex items-center space-x-3">
            <select
              value={optimizationType}
              onChange={(e) => setOptimizationType(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-700 outline-none"
            >
              <option value="conservative">Conservative (Minimal Edits)</option>
              <option value="ats_focused">ATS-Focused (Keywords & Phrasing)</option>
              <option value="recruiter_focused">Recruiter-Focused (Active Impact)</option>
            </select>

            <button
              onClick={handleRunOptimization}
              disabled={isOptimizing}
              className="px-6 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
            >
              {isOptimizing ? 'Optimizing...' : 'Run Optimization'}
            </button>
          </div>
        )}
      </div>

      {/* Optimization Results */}
      {result && (
        <div className="space-y-6">
          {/* Score Impact Banner */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center space-x-6">
              <div>
                <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider block">
                  Original ATS Score
                </span>
                <span className="text-2xl font-bold text-slate-800">
                  {result.beforeScore}%
                </span>
              </div>

              <div className="text-2xl text-emerald-600 font-bold">→</div>

              <div>
                <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider block">
                  Optimized ATS Score
                </span>
                <span className="text-2xl font-bold text-emerald-950">
                  {result.afterScore}%
                </span>
              </div>

              <div className="px-3 py-1 bg-emerald-200/60 text-emerald-900 rounded-lg text-sm font-bold">
                {result.scoreDelta >= 0 ? `+${result.scoreDelta}%` : `${result.scoreDelta}%`}
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => handleDownload(result.versionId, 'pdf')}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-sm"
              >
                Download PDF
              </button>
              <button
                onClick={() => handleDownload(result.versionId, 'docx')}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm"
              >
                Download DOCX
              </button>
              <Link
                to={`/resumes/${resumeId}/versions/${result.versionId}/compare`}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-sm"
              >
                Compare Versions
              </Link>
              <Link
                to={`/resumes/${resumeId}`}
                className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium"
              >
                View Resume
              </Link>
            </div>
          </div>


          {/* Fact Guardrail Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
              <span className="text-xs text-slate-500 font-medium block">Approved Modifications</span>
              <span className="text-xl font-bold text-emerald-700 mt-1 block">
                {result.totalChangesApplied}
              </span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
              <span className="text-xs text-slate-500 font-medium block">Blocked Hallucinations</span>
              <span className="text-xl font-bold text-rose-700 mt-1 block">
                {result.totalChangesRejected}
              </span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
              <span className="text-xs text-slate-500 font-medium block">Version ID</span>
              <span className="text-xs font-mono text-slate-700 mt-1 block truncate">
                v{result.versionNumber} ({result.versionId.slice(0, 8)}...)
              </span>
            </div>
          </div>

          {/* Proposed Professional Summary */}
          {result.summarySuggestion && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-2">
              <h2 className="text-sm font-bold text-slate-900">Tailored Professional Summary</h2>
              <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-lg border border-slate-200">
                {result.summarySuggestion}
              </p>
            </div>
          )}

          {/* Full Changes Diff */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Applied Modifications & Guardrail Audit</h2>
              <span className="text-xs text-slate-500">
                {result.changes.length} changes evaluated
              </span>
            </div>
            <DiffViewer changes={result.changes} />
          </div>
        </div>
      )}
    </div>
  );
};
