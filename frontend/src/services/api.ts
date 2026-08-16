/**
 * Centralized API Client
 */

import axios, { AxiosError } from 'axios';
import { useAuthStore } from './authStore';

export const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT token to requests
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Global response interceptor for 401 handling
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

// ── Auth Endpoints ─────────────────────────────────────────────────────────────
export const authApi = {
  login: (data: any) => api.post('/auth/login', data),
  register: (data: any) => api.post('/auth/register', data),
  getProfile: () => api.get('/auth/profile'),
  logout: () => api.post('/auth/logout'),
};

// ── Resume Ingestion Endpoints ────────────────────────────────────────────────
export const resumeApi = {
  uploadResume: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/resumes/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  listResumes: () => api.get('/resumes'),
  getResume: (id: string) => api.get(`/resumes/${id}`),
  deleteResume: (id: string) => api.delete(`/resumes/${id}`),
};

// ── Job Description Endpoints ─────────────────────────────────────────────────
export const jobApi = {
  createJob: (data: { jobTitle: string; companyName?: string; rawText: string }) =>
    api.post('/jobs', data),
  listJobs: () => api.get('/jobs'),
  getJob: (id: string) => api.get(`/jobs/${id}`),
  deleteJob: (id: string) => api.delete(`/jobs/${id}`),
  matchResume: (jobId: string, resumeId: string) =>
    api.post(`/jobs/${jobId}/match`, { resumeId }),
};

// ── AI Optimization Endpoints ────────────────────────────────────────────────
export const optimizationApi = {
  optimize: (data: { resumeId: string; jobDescriptionId: string; optimizationType?: string }) =>
    api.post('/optimization/optimize', data),
};

// ── Resume Versions & Download Endpoints ─────────────────────────────────────
export const versionApi = {
  listVersions: (resumeId: string) => api.get(`/resumes/${resumeId}/versions`),
  getVersion: (resumeId: string, versionId: string) =>
    api.get(`/resumes/${resumeId}/versions/${versionId}`),
  compareVersion: (resumeId: string, versionId: string) =>
    api.get(`/resumes/${resumeId}/versions/${versionId}/compare`),
  downloadVersion: (resumeId: string, versionId: string, format: 'pdf' | 'docx' = 'pdf') =>
    api.get(`/resumes/${resumeId}/versions/${versionId}/download?format=${format}`, {
      responseType: 'blob',
    }),
  deleteVersion: (resumeId: string, versionId: string) =>
    api.delete(`/resumes/${resumeId}/versions/${versionId}`),
};
