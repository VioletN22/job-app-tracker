import React, { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { JobApplication, Workflow, StageHistory, GuidanceDoc } from '../../shared/types';
import { StageTransition } from '../components/StageTransition';
import { GuidancePanel } from '../components/GuidancePanel';

interface DetailPageProps {
  applicationId: string | null;
  onBack: () => void;
}


export const DetailPage: React.FC<DetailPageProps> = ({ applicationId, onBack }) => {
  const [application, setApplication] = useState<JobApplication | null>(null);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [stageHistory, setStageHistory] = useState<StageHistory[]>([]);
  const [guidanceDocs, setGuidanceDocs] = useState<GuidanceDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    if (applicationId) {
      loadData();
    }
  }, [applicationId]);

  const loadData = async () => {
    if (!applicationId) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch application
      const app = await window.electronAPI.db.getApplication(applicationId);
      if (!app) {
        setError('Application not found');
        setApplication(null);
        setLoading(false);
        return;
      }

      setApplication(app);

      // Fetch all workflows and find matching one
      const workflows = await window.electronAPI.db.getAllWorkflows();
      const matchingWorkflow = workflows.find(
        (w: Workflow) => w.id === app.workflow_id
      );
      setWorkflow(matchingWorkflow || null);

      // Fetch stage history
      const history = await window.electronAPI.db.getStageHistory(applicationId);
      setStageHistory(history);

      // Fetch guidance docs for current stage
      const docs = await window.electronAPI.db.getGuidanceDocs(
        applicationId,
        app.current_stage
      );
      setGuidanceDocs(docs);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load application';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleStageTransition = async (stage: string, notes?: string) => {
    if (!applicationId || !application) return;

    setIsTransitioning(true);

    try {
      // Create stage history entry
      await window.electronAPI.db.createStageHistory(applicationId, stage, notes);

      // Update application with new stage
      await window.electronAPI.db.updateApplication(applicationId, {
        current_stage: stage,
      });

      // Refresh data
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to transition stage';
      setError(message);
    } finally {
      setIsTransitioning(false);
    }
  };

  const handleNotesBlur = async (newNotes: string) => {
    if (!applicationId || !application || newNotes === application.notes) {
      return;
    }

    try {
      await window.electronAPI.db.updateApplication(applicationId, {
        notes: newNotes,
      });
      setApplication({ ...application, notes: newNotes });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save notes';
      setError(message);
    }
  };

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
    if (!min && !max) return 'Not specified';
    const minK = min ? `$${Math.round(min / 1000)}k` : '';
    const maxK = max ? `$${Math.round(max / 1000)}k` : '';
    if (minK && maxK) return `${minK} - ${maxK}`;
    return minK || maxK;
  };

  if (loading) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <p className="text-gray-600">Loading application...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Applications
        </button>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  if (!application) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Applications
        </button>
        <p className="text-gray-600">Application not found</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Applications
      </button>

      {/* Main content grid */}
      <div className="lg:grid lg:grid-cols-3 gap-6">
        {/* Main content area (2 columns) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header section */}
          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {application.job_title}
            </h1>
            <p className="text-lg text-gray-600 mb-6">{application.company}</p>

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-4">
              {application.location && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">
                    Location
                  </p>
                  <p className="text-gray-900">{application.location}</p>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">
                  Salary Range
                </p>
                <p className="text-gray-900">
                  {formatSalary(application.salary_min, application.salary_max)}
                </p>
              </div>

              {application.equity && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">
                    Equity
                  </p>
                  <p className="text-gray-900">{application.equity}</p>
                </div>
              )}

              {application.application_deadline && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">
                    Application Deadline
                  </p>
                  <p className="text-gray-900">
                    {formatDate(application.application_deadline)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Job description section */}
          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Job Description
            </h2>
            <p className="text-gray-700 whitespace-pre-wrap">
              {application.job_description}
            </p>
          </div>

          {/* Guidance section */}
          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Guidance for {application.current_stage}
            </h2>
            <GuidancePanel guidanceDocs={guidanceDocs} />
          </div>
        </div>

        {/* Sidebar (1 column) */}
        <div className="space-y-6">
          {/* Stage transition */}
          <StageTransition
            currentStage={application.current_stage}
            availableStages={workflow?.stages || []}
            onTransition={handleStageTransition}
            isLoading={isTransitioning}
          />

          {/* Stage history */}
          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Stage History
            </h3>
            {stageHistory.length > 0 ? (
              <div className="space-y-3">
                {stageHistory.map((entry) => (
                  <div key={entry.id} className="border-b border-gray-200 pb-3 last:border-b-0">
                    <p className="font-medium text-gray-900">{entry.stage}</p>
                    <p className="text-xs text-gray-500">
                      {formatDate(entry.entered_at)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-600">No stage history yet.</p>
            )}
          </div>

          {/* Notes section */}
          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Notes</h3>
            <textarea
              defaultValue={application.notes || ''}
              onBlur={(e) => handleNotesBlur(e.currentTarget.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              rows={5}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
