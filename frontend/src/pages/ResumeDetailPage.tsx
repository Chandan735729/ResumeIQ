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
  const [showRawText, setShowRawText] = useState(false);

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
      const rawJobs = jobRes.data?.data?.jobDescriptions || (Array.isArray(jobRes.data?.data) ? jobRes.data.data : []);
      setJobs(rawJobs);
      if (rawJobs.length > 0) {
        setSelectedJobId(rawJobs[0].id);
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

  const layout = resume.extractedLayout
    ? typeof resume.extractedLayout === 'string'
      ? (() => { try { return JSON.parse(resume.extractedLayout); } catch { return null; } })()
      : resume.extractedLayout
    : null;

  const contact = layout?.contact;
  const summary = layout?.summary;
  const skills = layout?.skills || [];
  const experience = layout?.experience || [];
  const education = layout?.education || [];
  const projects = layout?.projects || [];
  const certifications = layout?.certifications || [];
  const languages = layout?.languages || [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-slate-900">{contact?.name || resume.fileName}</h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200 uppercase">
              {resume.parseStatus || 'Parsed'}
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono uppercase">
              {resume.fileType}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            File: <strong>{resume.fileName}</strong> • Uploaded {new Date(resume.createdAt).toLocaleDateString()} • {(resume.fileSize / 1024).toFixed(1)} KB
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
        {/* Left 2 Columns: Structured Parsed Details */}
        <div className="lg:col-span-2 space-y-6">

          {/* Contact Information */}
          {contact && (contact.email || contact.phone || contact.location || contact.linkedin || contact.github) && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <h2 className="text-base font-bold text-slate-900">Contact & Profiles</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700">
                {contact.email && (
                  <div className="flex items-center space-x-2">
                    <span className="text-slate-400">✉️</span>
                    <a href={`mailto:${contact.email}`} className="hover:underline text-sky-600 font-medium">
                      {contact.email}
                    </a>
                  </div>
                )}
                {contact.phone && (
                  <div className="flex items-center space-x-2">
                    <span className="text-slate-400">📞</span>
                    <span>{contact.phone}</span>
                  </div>
                )}
                {contact.location && (
                  <div className="flex items-center space-x-2">
                    <span className="text-slate-400">📍</span>
                    <span>{contact.location}</span>
                  </div>
                )}
                {contact.linkedin && (
                  <div className="flex items-center space-x-2">
                    <span className="text-slate-400">🔗</span>
                    <a href={contact.linkedin.startsWith('http') ? contact.linkedin : `https://${contact.linkedin}`} target="_blank" rel="noreferrer" className="hover:underline text-sky-600">
                      {contact.linkedin}
                    </a>
                  </div>
                )}
                {contact.github && (
                  <div className="flex items-center space-x-2">
                    <span className="text-slate-400">💻</span>
                    <a href={contact.github.startsWith('http') ? contact.github : `https://${contact.github}`} target="_blank" rel="noreferrer" className="hover:underline text-sky-600">
                      {contact.github}
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Summary / Objective */}
          {summary && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-2">
              <h2 className="text-base font-bold text-slate-900">Professional Summary</h2>
              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">{summary}</p>
            </div>
          )}

          {/* Technical Skills */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-bold text-slate-900">Extracted Skills ({skills.length})</h2>
            </div>
            {skills.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {skills.map((skill: string, i: number) => (
                  <SkillPill key={i} skill={skill} status="neutral" />
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No structured skills detected.</p>
            )}
          </div>

          {/* Work Experience */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-slate-900">Work Experience ({experience.length})</h2>
            {experience.length > 0 ? (
              <div className="space-y-6 divide-y divide-slate-100">
                {experience.map((exp: any, i: number) => (
                  <div key={i} className={i > 0 ? 'pt-4 space-y-2' : 'space-y-2'}>
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start">
                      <div>
                        <h3 className="font-semibold text-slate-900 text-sm">
                          {exp.title} {exp.company && <span className="text-slate-500 font-normal">at {exp.company}</span>}
                        </h3>
                        {exp.location && <span className="text-xs text-slate-400">{exp.location}</span>}
                      </div>
                      <span className="text-xs text-slate-500 font-medium whitespace-nowrap mt-1 sm:mt-0">
                        {exp.startDate} – {exp.endDate || (exp.isCurrent ? 'Present' : '')}
                      </span>
                    </div>

                    {exp.bullets && exp.bullets.length > 0 && (
                      <ul className="space-y-1.5 text-xs text-slate-600 pl-2">
                        {exp.bullets.map((bullet: string, bIdx: number) => (
                          <li key={bIdx} className="flex items-start">
                            <span className="mr-2 text-sky-500 font-bold">•</span>
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No experience sections detected.</p>
            )}
          </div>

          {/* Projects */}
          {projects.length > 0 && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-slate-900">Projects ({projects.length})</h2>
              <div className="space-y-4 divide-y divide-slate-100">
                {projects.map((proj: any, i: number) => (
                  <div key={i} className={i > 0 ? 'pt-4 space-y-2' : 'space-y-2'}>
                    <div className="flex justify-between items-start">
                      <h3 className="font-semibold text-slate-900 text-sm">{proj.name || proj.title}</h3>
                      {proj.technologies && proj.technologies.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {proj.technologies.map((t: string, tIdx: number) => (
                            <span key={tIdx} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {proj.description && (
                      <p className="text-xs text-slate-600">{proj.description}</p>
                    )}
                    {proj.bullets && proj.bullets.length > 0 && (
                      <ul className="space-y-1 text-xs text-slate-600 pl-2">
                        {proj.bullets.map((b: string, bIdx: number) => (
                          <li key={bIdx} className="flex items-start">
                            <span className="mr-2 text-slate-400">•</span>
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Education */}
          {education.length > 0 && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <h2 className="text-base font-bold text-slate-900">Education ({education.length})</h2>
              <div className="space-y-3">
                {education.map((edu: any, i: number) => (
                  <div key={i} className="flex justify-between items-start text-xs">
                    <div>
                      <strong className="text-slate-900 text-sm block">{edu.degree}</strong>
                      <span className="text-slate-600">{edu.institution}</span>
                      {edu.gpa && <span className="text-slate-400 block mt-0.5">GPA: {edu.gpa}</span>}
                    </div>
                    {(edu.startDate || edu.endDate || edu.year) && (
                      <span className="text-slate-500 font-medium">
                        {edu.startDate ? `${edu.startDate} – ${edu.endDate || 'Present'}` : (edu.endDate || edu.year)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Certifications & Languages */}
          {(certifications.length > 0 || languages.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {certifications.length > 0 && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                  <h2 className="text-base font-bold text-slate-900">Certifications</h2>
                  <ul className="space-y-2 text-xs text-slate-700">
                    {certifications.map((c: any, i: number) => (
                      <li key={i} className="flex items-start">
                        <span className="mr-2 text-emerald-500">✓</span>
                        <div>
                          <strong>{typeof c === 'string' ? c : c.name}</strong>
                          {c.issuer && <span className="text-slate-500 block">{c.issuer}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {languages.length > 0 && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                  <h2 className="text-base font-bold text-slate-900">Languages</h2>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {languages.map((l: any, i: number) => (
                      <span key={i} className="px-2.5 py-1 bg-slate-100 rounded-lg text-slate-700 font-medium">
                        {typeof l === 'string' ? l : `${l.language}${l.proficiency ? ` (${l.proficiency})` : ''}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Raw Extracted Text Viewer */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-bold text-slate-900">Document Raw Text Extraction</h2>
              <button
                type="button"
                onClick={() => setShowRawText(!showRawText)}
                className="text-xs font-semibold text-sky-600 hover:text-sky-700 bg-sky-50 px-3 py-1.5 rounded-lg border border-sky-200 transition-colors"
              >
                {showRawText ? 'Hide Raw Text' : 'View Full Extracted Text'}
              </button>
            </div>
            {showRawText && (
              <div className="mt-3 p-4 bg-slate-900 text-slate-100 rounded-xl font-mono text-xs overflow-x-auto max-h-96 whitespace-pre-wrap leading-relaxed">
                {resume.extractedText || 'No raw text stored.'}
              </div>
            )}
          </div>

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
