'use client'

import { Job } from '@/lib/api'

interface JobListProps {
  jobs: Job[]
  selectedJob: string | null
  onSelectJob: (jobId: string) => void
  onRefresh: () => void
}

export default function JobList({ jobs, selectedJob, onSelectJob, onRefresh }: JobListProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Jobs</h2>
        <button
          onClick={onRefresh}
          className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm font-medium transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-2">
        {jobs.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">No jobs yet. Create one with a voice entry!</p>
        ) : (
          jobs.map((job) => (
            <button
              key={job.id}
              onClick={() => onSelectJob(job.id)}
              className={`
                w-full text-left p-3 rounded-lg border transition-colors
                ${selectedJob === job.id
                  ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-500 dark:border-primary-500'
                  : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                }
              `}
            >
              <div className="font-medium text-gray-900 dark:text-white">{job.name}</div>
              {job.address && (
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">{job.address}</div>
              )}
              <div className="flex items-center gap-2 mt-2">
                <span className={`
                  text-xs px-2 py-1 rounded
                  ${job.status === 'complete' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
                    job.status === 'in_progress' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300' :
                    'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'}
                `}>
                  {job.status}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {new Date(job.updated_at).toLocaleDateString()}
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

