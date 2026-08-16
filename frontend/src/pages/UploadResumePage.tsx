import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { resumeApi } from '../services/api';
import toast from 'react-hot-toast';

export const UploadResumePage: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const navigate = useNavigate();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error('Please select a PDF or DOCX resume to upload.');
      return;
    }

    setIsUploading(true);
    try {
      const res = await resumeApi.uploadResume(file);
      const resumeId = res.data.data.resumeId;
      toast.success('Resume uploaded and parsed successfully!');
      navigate(`/resumes/${resumeId}`);
    } catch (err: any) {
      if (err.response?.data?.errors && Array.isArray(err.response.data.errors) && err.response.data.errors.length > 0) {
        const errorMessages = err.response.data.errors.map((e: any) => e.message).join(' | ');
        toast.error(errorMessages, { duration: 6000 });
      } else {
        const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to upload and parse resume.';
        toast.error(msg);
      }
    } finally {
      setIsUploading(false);
    }
  };


  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Upload Your Resume</h1>
        <p className="text-sm text-slate-600 mb-8">
          Upload your existing PDF or DOCX resume. Our deterministic ingestion engine will extract your technical skills, work history, education, and credentials safely.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
              dragOver
                ? 'border-sky-500 bg-sky-50/50'
                : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
            }`}
            onClick={() => document.getElementById('file-upload-input')?.click()}
          >
            <input
              id="file-upload-input"
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFileChange}
              className="hidden"
            />

            <div className="w-12 h-12 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center mx-auto mb-4 text-xl">
              📄
            </div>

            {file ? (
              <div>
                <p className="text-sm font-semibold text-slate-900">{file.name}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {(file.size / 1024).toFixed(1)} KB — Ready for ingestion
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-slate-700">
                  <span className="text-sky-600 font-semibold">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-slate-500 mt-1">PDF or DOCX (Max 10MB)</p>
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!file || isUploading}
              className="px-6 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
            >
              {isUploading ? 'Parsing Resume...' : 'Upload & Ingest'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
