'use client'

import { Entry } from '@/lib/api'

interface EntryListProps {
  entries: Entry[]
  jobId: string | null
  onRefresh: () => void
}

export default function EntryList({ entries, jobId, onRefresh }: EntryListProps) {
  if (!jobId) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Entries</h2>
        <p className="text-gray-500">Select a job to view entries</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Entries</h2>
        <button
          onClick={onRefresh}
          className="text-primary-600 hover:text-primary-700 text-sm font-medium"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-4">
        {entries.length === 0 ? (
          <p className="text-gray-500 text-sm">No entries yet. Record your first voice entry!</p>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-2">
                <span className="text-sm text-gray-500">
                  {new Date(entry.entry_ts).toLocaleString()}
                </span>
                {entry.summary && (
                  <span className="text-xs bg-primary-50 text-primary-700 px-2 py-1 rounded">
                    Summary
                  </span>
                )}
              </div>
              
              <p className="text-gray-900 mb-2">{entry.transcript}</p>
              
              {entry.summary && (
                <p className="text-sm text-gray-600 italic mb-2">"{entry.summary}"</p>
              )}

              {entry.extracted && Object.keys(entry.extracted).length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  {entry.extracted.tasks_completed && (
                    <div className="mb-2">
                      <span className="text-xs font-medium text-gray-600">Completed: </span>
                      <span className="text-xs text-gray-800">
                        {Array.isArray(entry.extracted.tasks_completed)
                          ? entry.extracted.tasks_completed.join(', ')
                          : entry.extracted.tasks_completed}
                      </span>
                    </div>
                  )}
                  {entry.extracted.next_actions && (
                    <div className="mb-2">
                      <span className="text-xs font-medium text-gray-600">Next: </span>
                      <span className="text-xs text-gray-800">
                        {Array.isArray(entry.extracted.next_actions)
                          ? entry.extracted.next_actions.join(', ')
                          : entry.extracted.next_actions}
                      </span>
                    </div>
                  )}
                  {entry.extracted.materials && (
                    <div>
                      <span className="text-xs font-medium text-gray-600">Materials: </span>
                      <span className="text-xs text-gray-800">
                        {Array.isArray(entry.extracted.materials)
                          ? entry.extracted.materials.join(', ')
                          : entry.extracted.materials}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

