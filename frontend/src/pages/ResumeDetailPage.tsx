import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { resumeApi, versionApi, jobApi } from '../services/api';
import { SkillPill } from '../components/SkillPill';
import { ScoreBadge } from '../components/ScoreBadge';
import toast from 'react-hot-toast';

export const ResumeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [resume, setResume] = useState<any>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadResumeData(id);
    }
  }, [id]);

  const loadResumeData = async (resumeId: string) => {
    try {
      setIsLoading(true);
      const [resRes, verRes, jobRes] = await Promise.all([
        resumeApi.getResume(resumeId),
        versionApi.listVersions(resumeId).catch(() => ({ data: { data: { versions: [] } } })),
        jobApi.listJobs().catch(() => ({ data: { data: [] } })),
      ]);
      setResume(resRes.data.data);
      setVersions(verRes.data.data?.versions || []);
      setJobs(jobRes.data.data || []);
      if (jobRes.data.data?.length > 0) {
        setSelectedJobId(jobRes.data.data[0].id);
      }
    } catch {
      toast.error('Failed to load resume details.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async (versionId: string, format: 'pdf' | 'docx') => {
    try {
      if (!id) return;
      toast.loading(`Preparing ${format.toUpperCase()} download...`, { id: 'dl' });
      const res = await versionApi.downloadVersion(id, versionId, format);
      const blob = new Blob([res.data], {
        type: format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Resume_v_${format.toUpperCase()}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} downloaded!`, { id: 'dl' });
    } catch {
      toast.error('Failed to download document.', { id: 'dl' });
    }
  };

  if (isLoading) {
    return <div className="py-20 text-center text-slate-500">Loading resume profile...</div>;
  }

  if (!resume) {
    return <div className="py-20 text-center text-slate-500">Resume not found.</div>;
  }

  const layout = resume.extractedLayout ? JSON.parse(resume.extractedLayout) : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-slate-900">{resume.fileName}</h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
              {resume.parseStatus}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Uploaded on {new Date(resume.createdAt).toLocaleDateString()} • {(resume.fileSize / 1024).toFixed(1)} KB
          </p>
        </div>

        {/* Action: Match against JD */}
        <div className="flex items-center space-x-3">
          {jobs.length > 0 ? (
            <div className="flex items-center space-x-2">
              <select
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
                className="text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-700 outline-none"
              >
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    Target: {j.jobTitle}
                  </option>
                ))}
              </select>
              <Link
                to={`/jobs/${selectedJobId}/match?resumeId=${resume.id}`}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors whitespace-nowrap"
              >
                Run ATS Match →
              </Link>
            </div>
          ) : (
            <Link
              to="/jobs"
              className="px-4 py-2 bg-sky-600 text-white rounded-lg text-xs font-semibold"
            >
              + Create Target Job
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Parsed Resume Layout */}
        <div className="lg:col-span-2 space-y-6">
          {/* Skills */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 mb-4">Extracted Technical Skills</h2>
            {layout?.skills && layout.skills.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {layout.skills.map((skill: string, i: number) => (
                  <SkillPill key={i} skill={skill} status="neutral" />
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No skills found in resume.</p>
            )}
          </div>

          {/* Work Experience */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 mb-4">Work Experience</h2>
            {layout?.experience && layout.experience.length > 0 ? (
              <div className="space-y-6">
                {layout.experience.map((exp: any, i: number) => (
                  <div key={i} className="border-b border-slate-100 pb-4 last:border-b-0">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold text-slate-900 text-sm">
                          {exp.title} {exp.company && <span className="text-slate-500 font-normal">at {exp.company}</span>}
                        </h3>
                      </div>
                      <span className="text-xs text-slate-400">
                        {exp.startDate} - {exp.endDate || (exp.isCurrent ? 'Present' : '')}
                      </span>
                    </div>

                    {exp.bullets && exp.bullets.length > 0 && (
                      <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
                        {exp.bullets.map((bullet: string, bIdx: number) => (
                          <li key={bIdx} className="flex items-start">
                            <span className="mr-2 text-slate-400">•</span>
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No experience sections detected.</p>
            )}
          </div>

          {/* Education */}
          {layout?.education && layout.education.length > 0 && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="text-base font-bold text-slate-900 mb-3">Education</h2>
              <div className="space-y-2">
                {layout.education.map((edu: any, i: number) => (
                  <div key={i} className="text-sm text-slate-800">
                    <strong>{edu.degree}</strong> {edu.institution && `— ${edu.institution}`}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Versions & Optimizations */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 mb-1">Optimization Versions</h2>
            <p className="text-xs text-slate-500 mb-4">
              Traceable, immutable versions generated with AI and mathematical re-scoring.
            </p>

            {versions.length === 0 ? (
              <div className="p-4 text-center bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
                No optimizations run yet. Select a target job above and run an ATS match to generate your first version.
              </div>
            ) : (
              <div className="space-y-4">
                {versions.map((ver) => (
                  <div
                    key={ver.id}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-slate-900">
                        Version {ver.versionNumber}
                      </span>
                      <ScoreBadge score={ver.overallScore} size="sm" />
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{ver.optimizationType}</span>
                      <span>{new Date(ver.createdAt).toLocaleDateString()}</span>
                    </div>

                    <div className="pt-2 border-t border-slate-200 flex flex-wrap gap-2">
                      <Link
                        to={`/resumes/${resume.id}/versions/${ver.id}/compare`}
                        className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded text-xs font-medium"
                      >
                        Compare Diff
                      </Link>
                      <button
                        onClick={() => handleDownload(ver.id, 'pdf')}
                        className="px-2.5 py-1 bg-sky-50 border border-sky-200 hover:bg-sky-100 text-sky-700 rounded text-xs font-medium"
                      >
                        PDF
                      </button>
                      <button
                        onClick={() => handleDownload(ver.id, 'docx')}
                        className="px-2.5 py-1 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 rounded text-xs font-medium"
                      >
                        DOCX
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
