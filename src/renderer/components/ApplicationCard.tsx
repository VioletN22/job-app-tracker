import React from 'react';
import { MapPin, DollarSign, Calendar } from 'lucide-react';
import { JobApplication } from '../../shared/types';

interface ApplicationCardProps {
  application: JobApplication;
  onClick: (id: string) => void;
}

export const ApplicationCard: React.FC<ApplicationCardProps> = ({ application, onClick }) => {
  const formatDate = (dateString: string | null): string => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dateString;
    }
  };

  const formatSalary = (min: number | null, max: number | null): string => {
    if (!min && !max) return '';
    const minK = min ? `$${Math.round(min / 1000)}k` : '';
    const maxK = max ? `$${Math.round(max / 1000)}k` : '';
    if (minK && maxK) return `${minK} - ${maxK}`;
    return minK || maxK;
  };

  return (
    <div
      onClick={() => onClick(application.id)}
      className="bg-white p-4 rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer relative"
    >
      {/* Stage badge */}
      <div className="absolute top-4 right-4 px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-medium">
        {application.current_stage}
      </div>

      {/* Title */}
      <h3 className="text-lg font-semibold text-gray-900 pr-24 mb-1">
        {application.job_title}
      </h3>

      {/* Company */}
      <p className="text-sm text-gray-600 mb-3">{application.company}</p>

      {/* Location */}
      {application.location && (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
          <MapPin className="w-4 h-4 text-gray-400" />
          <span>{application.location}</span>
        </div>
      )}

      {/* Salary */}
      {(application.salary_min || application.salary_max) && (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
          <DollarSign className="w-4 h-4 text-gray-400" />
          <span>{formatSalary(application.salary_min, application.salary_max)}</span>
        </div>
      )}

      {/* Application deadline */}
      {application.application_deadline && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Calendar className="w-4 h-4 text-gray-400" />
          <span>{formatDate(application.application_deadline)}</span>
        </div>
      )}
    </div>
  );
};
