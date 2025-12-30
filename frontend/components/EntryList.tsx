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
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Entries</h2>
        <p className="text-gray-500 dark:text-gray-400">Select a job to view entries</p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Entries</h2>
        <button
          onClick={onRefresh}
          className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm font-medium transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-4">
        {entries.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">No entries yet. Record your first voice entry!</p>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 
                         bg-gray-50 dark:bg-gray-700/50
                         hover:shadow-md dark:hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {new Date(entry.entry_ts).toLocaleString()}
                </span>
                {entry.summary && (
                  <span className="text-xs bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-2 py-1 rounded">
                    Summary
                  </span>
                )}
              </div>
              
              <p className="text-gray-900 dark:text-gray-100 mb-2">{entry.transcript}</p>
              
              {entry.summary && (
                <p className="text-sm text-gray-600 dark:text-gray-400 italic mb-2">"{entry.summary}"</p>
              )}

              {entry.extracted && Object.keys(entry.extracted).length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                  {entry.extracted.tasks_completed && (
                    <div className="mb-2">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Completed: </span>
                      <span className="text-xs text-gray-800 dark:text-gray-300">
                        {Array.isArray(entry.extracted.tasks_completed)
                          ? entry.extracted.tasks_completed.join(', ')
                          : entry.extracted.tasks_completed}
                      </span>
                    </div>
                  )}
                  {entry.extracted.next_actions && (
                    <div className="mb-2">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Next: </span>
                      <span className="text-xs text-gray-800 dark:text-gray-300">
                        {Array.isArray(entry.extracted.next_actions)
                          ? entry.extracted.next_actions.join(', ')
                          : entry.extracted.next_actions}
                      </span>
                    </div>
                  )}
                  {entry.extracted.materials && (
                    <div>
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Materials: </span>
                      <span className="text-xs text-gray-800 dark:text-gray-300">
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

