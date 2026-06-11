import React from 'react';

interface ListPageProps {
  onSelectApplication: (id: string) => void;
}

export const ListPage: React.FC<ListPageProps> = ({ onSelectApplication: _onSelectApplication }) => {
  return (
    <div className="p-8">
      <h2 className="text-3xl font-bold text-gray-900 mb-4">Applications</h2>
      <p className="text-gray-600">Applications list page coming soon...</p>
    </div>
  );
};
