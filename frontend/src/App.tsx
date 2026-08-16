import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Navbar } from './components/Navbar';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';

// Pages
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { UploadResumePage } from './pages/UploadResumePage';
import { ResumeDetailPage } from './pages/ResumeDetailPage';
import { JobDescriptionsPage } from './pages/JobDescriptionsPage';
import { ATSAnalysisPage } from './pages/ATSAnalysisPage';
import { OptimizationPage } from './pages/OptimizationPage';
import { VersionComparisonPage } from './pages/VersionComparisonPage';

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
          <Navbar />
          <main className="flex-1">
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />

              {/* Protected Routes */}
              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/upload" element={<UploadResumePage />} />
                <Route path="/resumes/:id" element={<ResumeDetailPage />} />
                <Route
                  path="/resumes/:resumeId/versions/:versionId/compare"
                  element={<VersionComparisonPage />}
                />
                <Route path="/jobs" element={<JobDescriptionsPage />} />
                <Route path="/jobs/:jobId/match" element={<ATSAnalysisPage />} />
                <Route path="/optimize" element={<OptimizationPage />} />
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <Toaster position="top-right" />
        </div>
      </BrowserRouter>
    </ErrorBoundary>
  );
};

export default App;
