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
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Jobs</h2>
        <button
          onClick={onRefresh}
          className="text-primary-600 hover:text-primary-700 text-sm font-medium"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-2">
        {jobs.length === 0 ? (
          <p className="text-gray-500 text-sm">No jobs yet. Create one with a voice entry!</p>
        ) : (
          jobs.map((job) => (
            <button
              key={job.id}
              onClick={() => onSelectJob(job.id)}
              className={`
                w-full text-left p-3 rounded-lg border transition-colors
                ${selectedJob === job.id
                  ? 'bg-primary-50 border-primary-500'
                  : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                }
              `}
            >
              <div className="font-medium text-gray-900">{job.name}</div>
              {job.address && (
                <div className="text-sm text-gray-600 mt-1">{job.address}</div>
              )}
              <div className="flex items-center gap-2 mt-2">
                <span className={`
                  text-xs px-2 py-1 rounded
                  ${job.status === 'complete' ? 'bg-green-100 text-green-800' :
                    job.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'}
                `}>
                  {job.status}
                </span>
                <span className="text-xs text-gray-500">
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

