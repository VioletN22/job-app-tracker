import React, { useState } from 'react';
import { Search, Upload } from 'lucide-react';

interface Filters {
  company?: string;
  stage?: string;
}

interface FilterBarProps {
  onFilterChange: (filters: Filters) => void;
  onAddClick: () => void;
}

const STAGE_OPTIONS = [
  { value: '', label: 'All stages' },
  { value: 'started', label: 'Started' },
  { value: 'applied', label: 'Applied' },
  { value: 'oa', label: 'OA' },
  { value: 'interview', label: 'Interview' },
  { value: 'interview_2', label: 'Interview 2' },
  { value: 'interview_3', label: 'Interview 3' },
  { value: 'offer', label: 'Offer' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

export const FilterBar: React.FC<FilterBarProps> = ({ onFilterChange, onAddClick }) => {
  const [company, setCompany] = useState('');
  const [stage, setStage] = useState('');

  const handleCompanyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCompany(value);
    onFilterChange({
      company: value || undefined,
      stage: stage || undefined,
    });
  };

  const handleStageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setStage(value);
    onFilterChange({
      company: company || undefined,
      stage: value || undefined,
    });
  };

  return (
    <div className="flex items-center justify-between gap-4 mb-6">
      {/* Left side: search + stage filter */}
      <div className="flex items-center gap-4 flex-1">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Filter by company..."
            value={company}
            onChange={handleCompanyChange}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <select
          value={stage}
          onChange={handleStageChange}
          className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          {STAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Right side: Add Application button */}
      <button
        onClick={onAddClick}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        <Upload className="w-5 h-5" />
        Add Application
      </button>
    </div>
  );
};
