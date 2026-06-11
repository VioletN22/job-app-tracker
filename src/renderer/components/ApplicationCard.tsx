import React from 'react';
import { MapPin, DollarSign, Calendar, Trash2 } from 'lucide-react';
import { JobApplication } from '../../shared/types';

interface ApplicationCardProps {
  application: JobApplication;
  onClick: (id: string) => void;
  onDelete?: (id: string) => void;
}

export const ApplicationCard: React.FC<ApplicationCardProps> = ({ application, onClick, onDelete }) => {
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

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete application for ${application.job_title} at ${application.company}?`)) {
      onDelete?.(application.id);
    }
  };

  return (
    <div
      style={{
        borderBottom: '1px solid var(--line)',
        paddingBottom: '16px',
        marginBottom: '16px',
        cursor: 'pointer',
        position: 'relative',
        paddingRight: '32px',
      }}
      onClick={() => onClick(application.id)}
      onMouseEnter={(e) => {
        const btn = e.currentTarget.querySelector('button');
        if (btn) btn.style.opacity = '1';
      }}
      onMouseLeave={(e) => {
        const btn = e.currentTarget.querySelector('button');
        if (btn) btn.style.opacity = '0.3';
      }}
    >
      {/* Delete button */}
      {onDelete && (
        <button
          onClick={handleDelete}
          style={{
            position: 'absolute',
            top: '0',
            right: '0',
            padding: '4px 8px',
            backgroundColor: 'transparent',
            color: 'var(--muted)',
            border: 'none',
            cursor: 'pointer',
            opacity: 0.3,
            transition: 'opacity 0.2s',
          }}
          title="Delete application"
        >
          <Trash2 size={16} />
        </button>
      )}

      {/* Stage badge */}
      <div
        style={{
          display: 'inline-block',
          padding: '4px 8px',
          backgroundColor: 'var(--panel)',
          color: 'var(--muted)',
          fontSize: '11px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontWeight: 600,
          marginBottom: '8px',
        }}
      >
        {application.current_stage}
      </div>

      {/* Title */}
      <h3
        style={{
          fontSize: '16px',
          fontWeight: 700,
          color: 'var(--ink)',
          marginTop: '8px',
          marginBottom: '4px',
          paddingRight: '24px',
        }}
      >
        {application.job_title}
      </h3>

      {/* Company */}
      <p
        style={{
          fontSize: '13px',
          color: 'var(--muted)',
          marginBottom: '12px',
        }}
      >
        {application.company}
      </p>

      {/* Location */}
      {application.location && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--muted)', marginBottom: '8px' }}>
          <MapPin size={14} />
          <span>{application.location}</span>
        </div>
      )}

      {/* Salary */}
      {(application.salary_min || application.salary_max) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--muted)', marginBottom: '8px' }}>
          <DollarSign size={14} />
          <span>{formatSalary(application.salary_min, application.salary_max)}</span>
        </div>
      )}

      {/* Application deadline */}
      {application.application_deadline && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--muted)' }}>
          <Calendar size={14} />
          <span>{formatDate(application.application_deadline)}</span>
        </div>
      )}
    </div>
  );
};
