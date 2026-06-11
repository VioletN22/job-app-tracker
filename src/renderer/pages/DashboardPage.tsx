import React, { useState, useEffect } from 'react';
import { BarChart, Calendar, TrendingUp } from 'lucide-react';
import { JobApplication } from '../../shared/types';
import { useApplications } from '../hooks/useApplications';

interface DashboardStats {
  total: number;
  byStage: Record<string, number>;
  upcomingDeadlines: number;
  recentApplications: number;
}

export const DashboardPage: React.FC = () => {
  const { applications, loading } = useApplications();
  const [stats, setStats] = useState<DashboardStats>({
    total: 0,
    byStage: {},
    upcomingDeadlines: 0,
    recentApplications: 0,
  });

  useEffect(() => {
    const calculateStats = () => {
      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Count by stage
      const byStage: Record<string, number> = {};
      let upcomingDeadlines = 0;
      let recentApplications = 0;

      applications.forEach((app: JobApplication) => {
        // Count by stage
        byStage[app.current_stage] = (byStage[app.current_stage] || 0) + 1;

        // Check for upcoming deadlines
        if (app.application_deadline) {
          const deadline = new Date(app.application_deadline);
          if (deadline >= now && deadline <= sevenDaysFromNow) {
            upcomingDeadlines++;
          }
        }

        // Check for recent applications
        const createdAt = new Date(app.created_at);
        if (createdAt >= sevenDaysAgo) {
          recentApplications++;
        }
      });

      setStats({
        total: applications.length,
        byStage,
        upcomingDeadlines,
        recentApplications,
      });
    };

    calculateStats();
  }, [applications]);

  if (loading) {
    return (
      <div className="p-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Dashboard</h2>
        <p className="text-gray-600">Loading dashboard...</p>
      </div>
    );
  }

  // Sort stages by count (descending)
  const sortedStages = Object.entries(stats.byStage).sort((a, b) => b[1] - a[1]);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 mb-6">Dashboard</h2>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {/* Total Applications Card */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-500 uppercase mb-2">
                Total Applications
              </p>
              <p className="text-3xl font-bold text-gray-900">
                {stats.total}
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-blue-500 opacity-50" />
          </div>
        </div>

        {/* Upcoming Deadlines Card */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-500 uppercase mb-2">
                Upcoming Deadlines
              </p>
              <p className="text-3xl font-bold text-gray-900">
                {stats.upcomingDeadlines}
              </p>
            </div>
            <Calendar className="w-8 h-8 text-blue-500 opacity-50" />
          </div>
        </div>

        {/* This Week Card */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-500 uppercase mb-2">
                This Week
              </p>
              <p className="text-3xl font-bold text-gray-900">
                {stats.recentApplications}
              </p>
            </div>
            <BarChart className="w-8 h-8 text-blue-500 opacity-50" />
          </div>
        </div>
      </div>

      {/* By Stage Chart */}
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Applications by Stage
        </h3>

        {stats.total === 0 ? (
          <p className="text-gray-600">No applications yet. Start tracking your job applications!</p>
        ) : (
          <div className="space-y-4">
            {sortedStages.map(([stage, count]) => (
              <div key={stage} className="flex items-center gap-4">
                <div className="w-40">
                  <p className="text-sm font-medium text-gray-700">{stage}</p>
                </div>
                <div className="flex-1 bg-gray-100 rounded-full h-8 overflow-hidden">
                  <div
                    className="bg-blue-500 h-8 transition-all duration-300"
                    style={{ width: `${(count / stats.total) * 100}%` }}
                  />
                </div>
                <div className="w-12">
                  <p className="text-sm font-semibold text-gray-700 text-right">
                    {count}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
