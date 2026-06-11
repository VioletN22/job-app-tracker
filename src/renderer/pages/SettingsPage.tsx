import React, { useState, useEffect } from 'react';
import { Plus, Trash2, CheckCircle, AlertCircle } from 'lucide-react';
import { Workflow } from '../../shared/types';

interface WorkflowForm {
  company: string;
  name: string;
  stages: string;
  isDefault: boolean;
}

interface ClaudeAuthStatus {
  authenticated: boolean;
  tokenPath?: string;
  error?: string;
}

export const SettingsPage: React.FC = () => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [showAddWorkflow, setShowAddWorkflow] = useState(false);
  const [claudeAuth, setClaudeAuth] = useState<ClaudeAuthStatus | null>(null);
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
    checkClaudeAuth();
  }, []);

  const checkClaudeAuth = async () => {
    try {
      const status = await window.electronAPI.claude.checkAuth();
      setClaudeAuth(status);
    } catch (err) {
      console.error('Error checking Claude auth:', err);
      setClaudeAuth({
        authenticated: false,
        error: 'Failed to check Claude authentication status',
      });
    }
  };

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
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Claude AI Status</h3>
          {claudeAuth && (
            <div className="flex items-center gap-2">
              {claudeAuth.authenticated ? (
                <>
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-medium text-green-600">Connected</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5 text-yellow-600" />
                  <span className="text-sm font-medium text-yellow-600">Not Connected</span>
                </>
              )}
            </div>
          )}
        </div>

        {claudeAuth && claudeAuth.authenticated ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3 mb-4">
            <p className="text-sm text-green-900">
              ✓ Claude is authenticated and ready to use Extract with AI feature.
            </p>
            <p className="text-sm text-green-700">
              Your subscription will be used for all AI-powered features. No API keys or per-token billing needed.
            </p>
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-4">
            <p className="text-sm text-yellow-900 font-medium">
              To use Extract with AI, authenticate with Claude:
            </p>

            <div className="bg-white p-3 rounded border border-yellow-100 font-mono text-sm text-gray-800">
              claude login
            </div>

            <div className="space-y-2">
              <p className="text-sm text-yellow-900">
                <strong>Then restart this app after authenticating.</strong>
              </p>
              <button
                onClick={() => checkClaudeAuth()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
              >
                Check Authentication Status
              </button>
            </div>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4 space-y-3">
          <p className="text-sm text-blue-900 font-medium">How to Authenticate:</p>
          <ol className="text-sm text-blue-900 space-y-2 ml-4 list-decimal">
            <li>Open your terminal</li>
            <li>Run: <code className="bg-white px-2 py-1 rounded">claude login</code></li>
            <li>Sign in with your Claude account in the browser</li>
            <li>Return to this app and click "Check Authentication Status"</li>
            <li>Extract with AI will be ready to use</li>
          </ol>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-gray-900 font-medium mb-2">What Extract with AI Does:</p>
          <ul className="text-sm text-gray-700 space-y-1 ml-4 list-disc">
            <li>Paste any job listing (text, LinkedIn, screenshot, etc.)</li>
            <li>Claude analyzes and extracts all job details</li>
            <li>Automatically fills in: company, role, location, skills, salary, etc.</li>
            <li>Creates a complete application entry ready to track</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
