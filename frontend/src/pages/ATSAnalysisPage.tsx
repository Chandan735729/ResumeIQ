import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { jobApi, resumeApi } from '../services/api';
import { SkillPill } from '../components/SkillPill';
import toast from 'react-hot-toast';


export const ATSAnalysisPage: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const resumeIdParam = searchParams.get('resumeId');

  const [job, setJob] = useState<any>(null);
  const [resumes, setResumes] = useState<any[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string>(resumeIdParam || '');
  const [matchResult, setMatchResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMatching, setIsMatching] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadInitialData();
  }, [jobId]);

  const loadInitialData = async () => {
    try {
      setIsLoading(true);
      const [jobRes, resumeRes] = await Promise.all([
        jobApi.getJob(jobId!),
        resumeApi.listResumes(),
      ]);

      setJob(jobRes.data.data);
      const availableResumes = resumeRes.data.data || [];
      setResumes(availableResumes);

      const targetResumeId = selectedResumeId || (availableResumes.length > 0 ? availableResumes[0].id : '');
      if (targetResumeId) {
        setSelectedResumeId(targetResumeId);
        runMatch(jobId!, targetResumeId);
      }
    } catch {
      toast.error('Failed to load ATS analysis data.');
    } finally {
      setIsLoading(false);
    }
  };

  const runMatch = async (jId: string, rId: string) => {
    try {
      setIsMatching(true);
      const res = await jobApi.matchResume(jId, rId);
      setMatchResult(res.data.data);
    } catch {
      toast.error('Failed to run deterministic ATS match.');
    } finally {
      setIsMatching(false);
    }
  };

  const handleResumeChange = (newResumeId: string) => {
    setSelectedResumeId(newResumeId);
    setSearchParams({ resumeId: newResumeId });
    if (jobId && newResumeId) {
      runMatch(jobId, newResumeId);
    }
  };

  if (isLoading) {
    return <div className="py-20 text-center text-slate-500">Calculating ATS match scores...</div>;
  }

  const scoreResult = matchResult?.scoreResult;
  const match = matchResult?.matchResult;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Deterministic ATS Match Analysis
          </span>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            {job?.jobTitle} {job?.companyName && <span className="text-slate-500 font-normal">at {job.companyName}</span>}
          </h1>
          <div className="flex items-center space-x-3 mt-2">
            <span className="text-xs text-slate-500">Target Resume:</span>
            <select
              value={selectedResumeId}
              onChange={(e) => handleResumeChange(e.target.value)}
              className="text-xs font-medium border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-800 outline-none"
            >
              {resumes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.fileName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Overall Score */}
        {scoreResult && (
          <div className="flex items-center space-x-6">
            <div className="text-right">
              <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">Overall ATS Score</div>
              <div className="text-3xl font-extrabold text-slate-900 mt-0.5">
                {scoreResult.overallScore}%
              </div>
              <div className="text-xs text-slate-400">{scoreResult.interpretation}</div>
            </div>

            <button
              onClick={() =>
                navigate(`/optimize?resumeId=${selectedResumeId}&jobId=${job.id}`)
              }
              className="px-5 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-semibold shadow-md hover:shadow-lg transition-all"
            >
              ✨ Optimize with Safe AI
            </button>
          </div>
        )}
      </div>

      {isMatching ? (
        <div className="py-20 text-center text-slate-500">Recalculating 7 ATS scoring components...</div>
      ) : matchResult ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left 2 Cols: Component Breakdown & Skills */}
          <div className="lg:col-span-2 space-y-6">
            {/* 7 Components Breakdown */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-slate-900">7-Component ATS Score Breakdown</h2>
              <div className="space-y-3">
                {Object.entries(scoreResult.components).map(([key, comp]: [string, any]) => (
                  <div key={key} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="capitalize text-slate-700">{key}</span>
                      <span className="text-slate-900">
                        {comp.earned} / {comp.maxPossible} pts ({comp.percentage}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          comp.percentage >= 80
                            ? 'bg-emerald-500'
                            : comp.percentage >= 60
                            ? 'bg-amber-500'
                            : 'bg-rose-500'
                        }`}
                        style={{ width: `${Math.min(100, comp.percentage)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Matched Skills */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-slate-900">Matched Skills & Technologies</h2>
              {match?.skillMatch?.matched && match.skillMatch.matched.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {match.skillMatch.matched.map((item: any, i: number) => (
                    <SkillPill key={i} skill={item.skill} status="matched" evidence={item.matchedSkill} />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">No exact skill matches identified.</p>
              )}
            </div>

            {/* Missing Skills */}
            {match?.skillMatch?.missing && match.skillMatch.missing.length > 0 && (
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <h2 className="text-base font-bold text-slate-900">Missing Job Requirements</h2>
                <div className="flex flex-wrap gap-2">
                  {match.skillMatch.missing.map((s: string, i: number) => (
                    <SkillPill key={i} skill={s} status="missing" />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Explainable Recommendations */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-slate-900">Actionable Recommendations</h2>
              {matchResult.recommendations && matchResult.recommendations.length > 0 ? (
                <ul className="space-y-3 text-xs text-slate-600">
                  {matchResult.recommendations.map((rec: string, i: number) => (
                    <li key={i} className="p-3 bg-slate-50 rounded-lg border border-slate-200 leading-relaxed">
                      💡 {rec}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">No specific gaps detected.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
