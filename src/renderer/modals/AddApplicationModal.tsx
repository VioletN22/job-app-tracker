import React, { useState } from 'react';
import { X } from 'lucide-react';

interface AddApplicationModalProps {
  onClose: () => void;
  onSubmit: (jobListing: string) => Promise<void>;
  isLoading?: boolean;
}

export const AddApplicationModal: React.FC<AddApplicationModalProps> = ({
  onClose,
  onSubmit,
  isLoading = false,
}) => {
  const [jobListing, setJobListing] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFileUpload = async () => {
    try {
      setError(null);
      const result = await window.electronAPI.file.selectFile();
      if (result && result.content) {
        setJobListing(result.content);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload file';
      setError(errorMessage);
      console.error('Error uploading file:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!jobListing.trim()) {
      setError('Please provide a job listing');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit(jobListing);
      setJobListing('');
      onClose();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add application';
      setError(errorMessage);
      console.error('Error adding application:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Add Job Application</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6">
          {/* Error message */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Textarea */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Job Listing
            </label>
            <textarea
              value={jobListing}
              onChange={(e) => setJobListing(e.target.value)}
              placeholder="Paste the job listing here or click 'Upload File' to select a file..."
              className="w-full h-64 p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Upload File button */}
          <div className="mb-6">
            <button
              type="button"
              onClick={handleFileUpload}
              className="px-4 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Upload File
            </button>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              disabled={isSubmitting || isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium ${
                (isSubmitting || isLoading) ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              disabled={isSubmitting || isLoading}
            >
              {isSubmitting || isLoading ? 'Adding...' : 'Add Application'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
