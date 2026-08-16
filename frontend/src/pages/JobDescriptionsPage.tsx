import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { jobApi, resumeApi } from '../services/api';
import toast from 'react-hot-toast';

export const JobDescriptionsPage: React.FC = () => {
  const [jobs, setJobs] = useState<any[]>([]);
  const [resumes, setResumes] = useState<any[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [jobTitle, setJobTitle] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [rawText, setRawText] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [jobRes, resumeRes] = await Promise.all([
        jobApi.listJobs().catch(() => ({ data: { data: [] } })),
        resumeApi.listResumes().catch(() => ({ data: { data: [] } })),
      ]);
      setJobs(jobRes.data.data || []);
      setResumes(resumeRes.data.data || []);
    } catch {
      toast.error('Failed to load job descriptions.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobTitle || !rawText) {
      toast.error('Job title and description text are required.');
      return;
    }

    try {
      await jobApi.createJob({ jobTitle, companyName, rawText });
      toast.success('Job description analyzed and saved!');
      setJobTitle('');
      setCompanyName('');
      setRawText('');
      setIsCreating(false);
      loadData();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to save job description.';
      toast.error(msg);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Target Job Descriptions</h1>
          <p className="text-sm text-slate-600">
            Ingest target roles to extract required skills, experience levels, and ATS matching keywords.
          </p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors"
        >
          {isCreating ? 'Close Form' : '+ Add New Target Job'}
        </button>
      </div>

      {/* Creation Modal / Inline Form */}
      {isCreating && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Analyze New Job Description</h2>
          <form onSubmit={handleCreateJob} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Job Title *
                </label>
                <input
                  type="text"
                  required
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="e.g. Senior Python Developer"
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Company Name (Optional)
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Paste Job Description Text *
              </label>
              <textarea
                rows={6}
                required
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Paste the full job posting requirements here..."
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-sky-500 font-mono text-xs"
              />
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-semibold shadow-sm"
              >
                Ingest & Extract Requirements
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Jobs List */}
      {isLoading ? (
        <div className="py-20 text-center text-slate-500">Loading target job listings...</div>
      ) : jobs.length === 0 ? (
        <div className="p-8 text-center bg-white rounded-xl border border-dashed border-slate-300">
          <p className="text-slate-600 text-sm mb-4">No job descriptions added yet.</p>
          <button
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium"
          >
            Add Your First Target Job
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {jobs.map((job) => {
            const structure = job.extractedStructure ? JSON.parse(job.extractedStructure) : null;
            return (
              <div
                key={job.id}
                className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3 flex flex-col justify-between"
              >
                <div>
                  <h3 className="font-bold text-slate-900 text-base">{job.jobTitle}</h3>
                  {job.companyName && (
                    <p className="text-xs text-slate-500">{job.companyName}</p>
                  )}

                  {structure?.requiredSkills && structure.requiredSkills.length > 0 && (
                    <div className="mt-3">
                      <span className="text-xs font-semibold text-slate-400 block mb-1.5">
                        EXTRACTED REQUIREMENTS
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {structure.requiredSkills.slice(0, 4).map((s: string, i: number) => (
                          <span
                            key={i}
                            className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded"
                          >
                            {s}
                          </span>
                        ))}
                        {structure.requiredSkills.length > 4 && (
                          <span className="text-xs text-slate-400 px-1 py-0.5">
                            +{structure.requiredSkills.length - 4} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-400">
                    {new Date(job.createdAt).toLocaleDateString()}
                  </span>
                  {resumes.length > 0 && (
                    <Link
                      to={`/jobs/${job.id}/match?resumeId=${resumes[0].id}`}
                      className="text-xs font-semibold text-sky-600 hover:text-sky-700"
                    >
                      Run ATS Match →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
