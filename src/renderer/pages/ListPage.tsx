import React, { useState } from 'react';
import { FilterBar } from '../components/FilterBar';
import { ApplicationCard } from '../components/ApplicationCard';
import { AddApplicationModal } from '../modals/AddApplicationModal';
import { Dialog } from '../components/Dialog';
import { useApplications } from '../hooks/useApplications';

interface Filters {
  company?: string;
  stage?: string;
}

interface ListPageProps {
  onSelectApplication: (id: string) => void;
}

export const ListPage: React.FC<ListPageProps> = ({ onSelectApplication }) => {
  const { applications, loading, refresh } = useApplications();
  const [showAddModal, setShowAddModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [filters, setFilters] = useState<Filters>({});
  const [errorDialog, setErrorDialog] = useState<{ title: string; message: string } | null>(null);

  const handleFilterChange = async (newFilters: Filters) => {
    setFilters(newFilters);
    await refresh(newFilters);
  };

  const handleAddClick = () => {
    setShowAddModal(true);
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
  };

  const handleAddApplication = async (jobListing: string) => {
    try {
      setIsProcessing(true);
      const result = await window.electronAPI.claude.ingestJobListing(jobListing, 'Unknown Company');

      if (!result.success) {
        throw new Error(result.error || 'Failed to add application');
      }

      await refresh(filters);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add application';
      throw new Error(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleQuickAdd = async (company: string, jobTitle: string) => {
    try {
      setIsProcessing(true);
      const result = await window.electronAPI.quickAddApplication(company, jobTitle);

      if (!result.success) {
        throw new Error(result.error || 'Failed to add application');
      }

      await refresh(filters);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add application';
      throw new Error(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteApplication = async (applicationId: string) => {
    try {
      await window.electronAPI.db.deleteApplication(applicationId);
      await refresh(filters);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete application';
      setErrorDialog({
        title: 'Error Deleting Application',
        message: errorMessage,
      });
    }
  };

  // Filter applications based on current filters
  const filteredApplications = applications.filter((app) => {
    if (filters.company && !app.company.toLowerCase().includes(filters.company.toLowerCase())) {
      return false;
    }
    if (filters.stage && app.current_stage !== filters.stage) {
      return false;
    }
    return true;
  });

  return (
    <div className="p-8">
      <h2 className="text-3xl font-bold text-gray-900 mb-8">Applications</h2>

      {/* Filter Bar */}
      <FilterBar onFilterChange={handleFilterChange} onAddClick={handleAddClick} />

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <p className="text-gray-600">Loading applications...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredApplications.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <p className="text-gray-600">
            No applications found. Add one to get started!
          </p>
        </div>
      )}

      {/* Applications Grid */}
      {!loading && filteredApplications.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: '24px' }}>
          {filteredApplications.map((app) => (
            <ApplicationCard
              key={app.id}
              application={app}
              onClick={onSelectApplication}
              onDelete={handleDeleteApplication}
            />
          ))}
        </div>
      )}

      {/* Add Application Modal */}
      {showAddModal && (
        <AddApplicationModal
          onClose={handleCloseModal}
          onSubmit={handleAddApplication}
          onQuickAdd={handleQuickAdd}
          isLoading={isProcessing}
        />
      )}

      {/* Error Dialog */}
      {errorDialog && (
        <Dialog
          isOpen={true}
          title={errorDialog.title}
          message={errorDialog.message}
          onConfirm={() => setErrorDialog(null)}
          onCancel={() => setErrorDialog(null)}
          confirmText="OK"
          isDangerous={false}
        />
      )}
    </div>
  );
};
