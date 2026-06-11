import React, { useState, useEffect } from 'react';
import { ArrowLeft, MapPin, DollarSign, Calendar, ChevronDown, ChevronRight } from 'lucide-react';
import { JobApplication, Workflow, StageHistory } from '../../shared/types';
import { ChatPanel } from '../components/ChatPanel';
import { Dropdown } from '../components/Dropdown';

interface DetailPageProps {
  applicationId: string | null;
  onBack: () => void;
}

const sectionLabel: React.CSSProperties = {
  fontSize: '11px',
  letterSpacing: '0.13em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  marginBottom: '8px',
};

export const DetailPage: React.FC<DetailPageProps> = ({ applicationId, onBack }) => {
  const [application, setApplication] = useState<JobApplication | null>(null);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [stageHistory, setStageHistory] = useState<StageHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState('');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showDescription, setShowDescription] = useState(false);

  useEffect(() => {
    if (applicationId) loadData();
  }, [applicationId]);

  const loadData = async () => {
    if (!applicationId) return;
    setLoading(true);
    setError(null);
    try {
      const app = await window.electronAPI.db.getApplication(applicationId);
      if (!app) {
        setError('Application not found');
        setLoading(false);
        return;
      }
      setApplication(app);

      const workflows = await window.electronAPI.db.getAllWorkflows();
      const wf = workflows.find((w: Workflow) => w.id === app.workflow_id) || null;
      setWorkflow(wf);

      // Pre-select the natural next stage in the pipeline
      if (wf) {
        const idx = wf.stages.indexOf(app.current_stage);
        const next = idx >= 0 && idx < wf.stages.length - 1 ? wf.stages[idx + 1] : '';
        setSelectedStage(next);
      }

      const history = await window.electronAPI.db.getStageHistory(applicationId);
      setStageHistory(history);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load application');
    } finally {
      setLoading(false);
    }
  };

  const handleStageMove = async () => {
    if (!applicationId || !selectedStage) return;
    setIsTransitioning(true);
    try {
      await window.electronAPI.db.createStageHistory(applicationId, selectedStage);
      await window.electronAPI.db.updateApplication(applicationId, { current_stage: selectedStage });
      setSelectedStage('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move stage');
    } finally {
      setIsTransitioning(false);
    }
  };

  const handleNotesBlur = async (newNotes: string) => {
    if (!applicationId || !application || newNotes === application.notes) return;
    try {
      await window.electronAPI.db.updateApplication(applicationId, { notes: newNotes });
      setApplication({ ...application, notes: newNotes });
    } catch {
      /* non-fatal */
    }
  };

  const formatDate = (d: string | null): string => {
    if (!d) return '';
    try {
      return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return d;
    }
  };

  const formatSalary = (min: number | null, max: number | null): string | null => {
    if (!min && !max) return null;
    const f = (n: number) => `$${Math.round(n / 1000)}k`;
    if (min && max) return `${f(min)} – ${f(max)}`;
    return f((min || max)!);
  };

  if (loading) {
    return (
      <div style={{ padding: '32px' }}>
        <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Loading…</p>
      </div>
    );
  }

  if (error || !application) {
    return (
      <div style={{ padding: '32px' }}>
        <button onClick={onBack} className="navlink" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
          <ArrowLeft size={14} /> Back to Applications
        </button>
        <p style={{ fontSize: '13px', color: 'var(--accent)' }}>{error || 'Application not found'}</p>
      </div>
    );
  }

  const nextStages = workflow
    ? workflow.stages.filter((s) => s !== application.current_stage)
    : [];
  const salary = formatSalary(application.salary_min, application.salary_max);
  const bullets = (text: string) =>
    text
      .split('\n')
      .map((l) => l.replace(/^[-•*]\s*/, '').trim())
      .filter(Boolean);

  return (
    <div style={{ padding: '32px', maxWidth: '960px', margin: '0 auto' }}>
      {/* Back */}
      <button
        onClick={onBack}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '11px',
          letterSpacing: '0.13em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          backgroundColor: 'transparent',
          border: 'none',
          cursor: 'pointer',
          marginBottom: '28px',
          padding: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ink)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted)')}
      >
        <ArrowLeft size={14} /> Back
      </button>

      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--ink)', paddingBottom: '20px', marginBottom: '24px' }}>
        <span
          style={{
            display: 'inline-block',
            padding: '4px 8px',
            backgroundColor: 'var(--accent)',
            color: '#fff',
            fontSize: '10px',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: '12px',
          }}
        >
          {application.current_stage}
        </span>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--ink)', marginBottom: '4px' }}>
          {application.job_title}
        </h1>
        <p style={{ fontSize: '15px', color: 'var(--muted)', marginBottom: '12px' }}>{application.company}</p>

        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--muted)' }}>
          {application.location && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MapPin size={13} /> {application.location}
            </span>
          )}
          {salary && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <DollarSign size={13} /> {salary}
            </span>
          )}
          {application.application_deadline && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={13} /> Due {formatDate(application.application_deadline)}
            </span>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '32px', alignItems: 'start' }}>
        {/* Left: content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', minWidth: 0 }}>
          {/* About (clean summary) */}
          <div>
            <p style={sectionLabel}>About the role</p>
            <p style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--ink)' }}>
              {application.job_description.length > 600 && !showDescription
                ? application.job_description.slice(0, 600) + '…'
                : application.job_description}
            </p>
            {application.job_description.length > 600 && (
              <button
                onClick={() => setShowDescription(!showDescription)}
                style={{
                  marginTop: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--muted)',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {showDescription ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {showDescription ? 'Show less' : 'Show full description'}
              </button>
            )}
          </div>

          {/* Skills, compact two-column */}
          {(application.required_skills || application.key_responsibilities) && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: application.required_skills && application.key_responsibilities ? '1fr 1fr' : '1fr',
                border: '1px solid var(--line)',
              }}
            >
              {[
                { label: 'Required skills', text: application.required_skills },
                { label: 'Responsibilities', text: application.key_responsibilities },
              ]
                .filter((col) => col.text)
                .map((col, colIdx) => (
                  <div
                    key={col.label}
                    style={{
                      padding: '20px',
                      borderLeft: colIdx === 1 ? '1px solid var(--line)' : 'none',
                    }}
                  >
                    <p style={sectionLabel}>{col.label}</p>
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {bullets(col.text).slice(0, 6).map((s, i) => (
                        <li
                          key={i}
                          style={{
                            position: 'relative',
                            paddingLeft: '18px',
                            marginBottom: '10px',
                            fontSize: '13px',
                            lineHeight: 1.55,
                            color: 'var(--ink)',
                          }}
                        >
                          <span
                            style={{
                              position: 'absolute',
                              left: 0,
                              top: 0,
                              color: 'var(--accent)',
                              fontWeight: 600,
                            }}
                          >
                            –
                          </span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          )}

          {/* Assistant chat */}
          <ChatPanel
            applicationId={application.id}
            company={application.company}
            jobTitle={application.job_title}
          />
        </div>

        {/* Right: sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          {/* Stage move */}
          <div>
            <p style={sectionLabel}>Move to stage</p>
            <div style={{ marginBottom: '10px' }}>
              <Dropdown
                value={selectedStage}
                options={nextStages.map((s) => ({ value: s, label: s.replace(/_/g, ' ') }))}
                onChange={setSelectedStage}
                placeholder="Select stage…"
              />
            </div>
            {selectedStage && (
              <button
                onClick={handleStageMove}
                disabled={isTransitioning}
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  opacity: isTransitioning ? 0.6 : 1,
                }}
              >
                {isTransitioning ? 'Moving…' : `Move to ${selectedStage}`}
              </button>
            )}
          </div>

          {/* History */}
          <div>
            <p style={sectionLabel}>History</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {stageHistory.length === 0 && (
                <p style={{ fontSize: '13px', color: 'var(--muted)' }}>No history yet.</p>
              )}
              {stageHistory.map((entry) => (
                <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{entry.stage}</span>
                  <span style={{ color: 'var(--muted)' }}>{formatDate(entry.entered_at)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <p style={sectionLabel}>Notes</p>
            <textarea
              defaultValue={application.notes || ''}
              onBlur={(e) => handleNotesBlur(e.currentTarget.value)}
              placeholder="Your notes…"
              rows={5}
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: 'var(--panel)',
                border: '1px solid var(--line)',
                fontSize: '13px',
                color: 'var(--ink)',
                fontFamily: 'inherit',
                lineHeight: 1.5,
                resize: 'vertical',
                outline: 'none',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
