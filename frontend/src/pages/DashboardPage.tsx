import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { resumeApi, jobApi } from '../services/api';
import toast from 'react-hot-toast';

export const DashboardPage: React.FC = () => {
  const [resumes, setResumes] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      const [resumeRes, jobRes] = await Promise.all([
        resumeApi.listResumes().catch(() => ({ data: { data: [] } })),
        jobApi.listJobs().catch(() => ({ data: { data: [] } })),
      ]);
      setResumes(resumeRes.data.data || []);
      setJobs(jobRes.data.data || []);
    } catch {
      toast.error('Failed to load dashboard data.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-600">
            Manage your resumes, target jobs, and optimization versions.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Link
            to="/jobs"
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors"
          >
            Target Jobs ({jobs.length})
          </Link>
          <Link
            to="/upload"
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors"
          >
            + Upload Resume
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-slate-500">Loading your profile data...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
          {/* Left Column: Resumes (2 cols) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Your Resumes</h2>
              <span className="text-xs text-slate-500">{resumes.length} total</span>
            </div>

            {resumes.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-dashed border-slate-300">
                <p className="text-slate-600 text-sm mb-4">No resumes uploaded yet.</p>
                <Link
                  to="/upload"
                  className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium"
                >
                  Upload First Resume
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {resumes.map((resume) => (
                  <div
                    key={resume.id}
                    className="p-5 bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-all flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center font-bold text-sm">
                        {resume.fileType?.toUpperCase() || 'PDF'}
                      </div>
                      <div>
                        <Link
                          to={`/resumes/${resume.id}`}
                          className="text-base font-semibold text-slate-900 hover:text-sky-600 transition-colors"
                        >
                          {resume.fileName}
                        </Link>
                        <div className="flex items-center space-x-3 text-xs text-slate-500 mt-1">
                          <span>Status: <strong className="text-slate-700">{resume.parseStatus}</strong></span>
                          <span>•</span>
                          <span>{new Date(resume.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Link
                        to={`/resumes/${resume.id}`}
                        className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-medium text-slate-700 transition-colors"
                      >
                        View & Optimize
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Quick Actions & JDs */}
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-slate-900">Recent Target Jobs</h2>
            {jobs.length === 0 ? (
              <div className="p-6 bg-white rounded-xl border border-slate-200 text-center">
                <p className="text-sm text-slate-600 mb-3">No job descriptions added.</p>
                <Link to="/jobs" className="text-sm font-semibold text-sky-600 hover:underline">
                  + Add Target Job
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.slice(0, 5).map((job) => (
                  <div
                    key={job.id}
                    className="p-4 bg-white rounded-xl border border-slate-200 text-sm"
                  >
                    <div className="font-semibold text-slate-900">{job.jobTitle}</div>
                    {job.companyName && (
                      <div className="text-xs text-slate-500 mt-0.5">{job.companyName}</div>
                    )}
                    <div className="mt-3 flex justify-between items-center text-xs">
                      <span className="text-slate-400">
                        {new Date(job.createdAt).toLocaleDateString()}
                      </span>
                      <Link
                        to={`/jobs/${job.id}/match`}
                        className="text-sky-600 font-semibold hover:underline"
                      >
                        Analyze Match →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
