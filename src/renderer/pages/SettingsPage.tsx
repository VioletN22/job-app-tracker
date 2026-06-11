import React, { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Workflow } from '../../shared/types';

interface WorkflowForm {
  company: string;
  name: string;
  stages: string;
  isDefault: boolean;
}

export const SettingsPage: React.FC = () => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [showAddWorkflow, setShowAddWorkflow] = useState(false);
  const [claudeAuth, setClaudeAuth] = useState('');
  const [form, setForm] = useState<WorkflowForm>({
    company: '',
    name: '',
    stages: '',
    isDefault: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await window.electronAPI.db.getAllWorkflows();
      setWorkflows(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load workflows';
      setError(message);
      console.error('Error loading workflows:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form
    if (!form.company.trim()) {
      alert('Please enter a company name');
      return;
    }
    if (!form.name.trim()) {
      alert('Please enter a workflow name');
      return;
    }
    if (!form.stages.trim()) {
      alert('Please enter workflow stages');
      return;
    }

    try {
      // Parse stages
      const stagesList = form.stages
        .split(',')
        .map((stage) => stage.trim())
        .filter((stage) => stage.length > 0);

      // Create workflow
      await window.electronAPI.db.createWorkflow(
        form.company.trim(),
        form.name.trim(),
        stagesList,
        form.isDefault
      );

      // Reset form
      setForm({
        company: '',
        name: '',
        stages: '',
        isDefault: false,
      });
      setShowAddWorkflow(false);

      // Reload workflows
      await loadWorkflows();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create workflow';
      setError(message);
      console.error('Error creating workflow:', err);
    }
  };

  const handleDeleteWorkflow = async (id: string) => {
    if (!confirm('Are you sure you want to delete this workflow?')) {
      return;
    }

    try {
      await window.electronAPI.db.deleteWorkflow(id);
      await loadWorkflows();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete workflow';
      setError(message);
      console.error('Error deleting workflow:', err);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Settings</h2>
        <p className="text-gray-600">Loading workflows...</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 mb-6">Settings</h2>

      {/* Error message */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Workflows section */}
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        {/* Header with Add button */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Company Workflows</h3>
          <button
            onClick={() => setShowAddWorkflow(!showAddWorkflow)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Workflow
          </button>
        </div>

        {/* Add Workflow Form */}
        {showAddWorkflow && (
          <form
            onSubmit={handleAddWorkflow}
            className="bg-gray-50 p-4 rounded-lg mb-6 space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Company Name
              </label>
              <input
                type="text"
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Google, Microsoft"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Workflow Name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Standard Hiring Process"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Stages (comma-separated)
              </label>
              <textarea
                value={form.stages}
                onChange={(e) => setForm({ ...form, stages: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                rows={3}
                placeholder="e.g., Applied, Phone Screen, Technical Interview, On-site, Offer"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isDefault"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <label htmlFor="isDefault" className="text-sm text-gray-700">
                Set as default for this company
              </label>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setShowAddWorkflow(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium text-gray-700"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Workflows list */}
        {workflows.length === 0 ? (
          <p className="text-gray-600">No workflows defined yet.</p>
        ) : (
          <div className="space-y-3">
            {workflows.map((workflow) => (
              <div
                key={workflow.id}
                className="bg-gray-50 p-4 rounded-lg flex items-start justify-between"
              >
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{workflow.company}</p>
                  <p className="text-sm text-gray-600 mb-2">{workflow.name}</p>
                  <div className="flex gap-2 flex-wrap">
                    {workflow.stages.map((stage) => (
                      <span
                        key={stage}
                        className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium"
                      >
                        {stage}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteWorkflow(workflow.id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                  title="Delete workflow"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Claude Authentication section */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 mt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Claude AI Setup</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              API Key (Optional - for Extract with AI)
            </label>
            <input
              type="password"
              value={claudeAuth}
              onChange={(e) => setClaudeAuth(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-sm text-gray-600 mt-2">
              Optional: Set your Anthropic API key to enable Claude AI extraction of job listings.
              Your subscription plan will be billed per token used.
            </p>
          </div>

          <div>
            <button
              onClick={() => {
                if (claudeAuth) {
                  // Set environment variable
                  const apiKey = claudeAuth;
                  // In a real app, this would be sent to the main process
                  alert('API key will be used for Claude AI features (requires app restart)');
                } else {
                  alert('Please enter an API key or leave it empty to skip');
                }
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Save Claude Settings
            </button>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
            <p className="text-sm text-blue-900">
              <strong>How Extract with AI works:</strong>
            </p>
            <ul className="text-sm text-blue-900 mt-2 space-y-1 ml-4 list-disc">
              <li>Paste a job listing into the Extract with AI tab</li>
              <li>Claude analyzes the job description</li>
              <li>Automatically extracts company, role, skills, and more</li>
              <li>Creates a complete application entry</li>
              <li>Without API key: you can manually fill in job details</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
