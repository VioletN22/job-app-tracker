import { useState, useEffect } from 'react';
import { JobApplication } from '../../shared/types';

interface UseApplicationsReturn {
  applications: JobApplication[];
  loading: boolean;
  error: string | null;
  refresh: (filters?: any) => Promise<void>;
}

export function useApplications(): UseApplicationsReturn {
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async (filters?: any) => {
    try {
      setLoading(true);
      setError(null);
      const data = await window.electronAPI.db.getAllApplications(filters);
      setApplications(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load applications';
      setError(errorMessage);
      console.error('Error loading applications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return { applications, loading, error, refresh };
}
