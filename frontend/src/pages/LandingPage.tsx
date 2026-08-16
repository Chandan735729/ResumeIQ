import React from 'react';
import { Link } from 'react-router-dom';

export const LandingPage: React.FC = () => {
  return (
    <div className="bg-gradient-to-b from-slate-50 to-white min-h-[calc(100vh-4rem)]">
      {/* Hero */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-20 text-center">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-sky-50 border border-sky-200 text-sky-700 text-xs font-semibold uppercase tracking-wider mb-6">
          <span>Deterministic ATS Engine + Guarded AI</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold text-slate-900 tracking-tight max-w-4xl mx-auto leading-tight">
          AI Resume Optimization That <span className="text-sky-600">Never Hallucinates</span> Facts.
        </h1>

        <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto">
          Match your real skills to target job descriptions with mathematical precision. Get explainable ATS scores and fact-guarded phrasing improvements.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row justify-center gap-4">
          <Link
            to="/register"
            className="px-8 py-3.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold shadow-md hover:shadow-lg transition-all text-base"
          >
            Start Free Optimization
          </Link>
          <Link
            to="/login"
            className="px-8 py-3.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-semibold border border-slate-300 shadow-sm transition-all text-base"
          >
            Sign In to Account
          </Link>
        </div>
      </div>

      {/* Feature Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 border-t border-slate-200">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <div className="w-10 h-10 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-lg mb-4">
              1
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Deterministic ATS Scoring</h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              100% reproducible mathematical scoring across 7 core dimensions. No arbitrary LLM ratings.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-lg mb-4">
              2
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Strict Fact Guardrails</h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              Deterministic post-generation checks reject any unevidenced technologies, fake certifications, or invented metrics.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-lg mb-4">
              3
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">PDF & DOCX Generation</h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              Export validated, professional multi-page resumes ready for enterprise applicant tracking systems.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
