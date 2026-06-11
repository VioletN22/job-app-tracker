import React from 'react';

interface DetailPageProps {
  applicationId: string | null;
  onBack: () => void;
}

export const DetailPage: React.FC<DetailPageProps> = ({ applicationId, onBack }) => {
  return (
    <div className="p-8">
      <button
        onClick={onBack}
        className="mb-4 px-4 py-2 text-blue-600 hover:text-blue-700 font-medium"
      >
        Back to Applications
      </button>
      <h2 className="text-3xl font-bold text-gray-900 mb-4">Application Details</h2>
      <p className="text-gray-600">Details page for application {applicationId} coming soon...</p>
    </div>
  );
};
