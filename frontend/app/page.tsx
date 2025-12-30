'use client'

import { useState, useEffect, useCallback } from 'react'
import VoiceRecorder from '@/components/VoiceRecorder'
import JobList from '@/components/JobList'
import EntryList from '@/components/EntryList'
import ThemeToggle from '@/components/ThemeToggle'
import Toast from '@/components/Toast'
import type { VoiceCommand } from '@/lib/voiceCommands'
import {
  getJobs,
  getEntries,
  createJob,
  createEntry,
  updateJob,
  updateJobState,
  searchEntries,
  createDebrief,
} from '@/lib/api'

export default function Home() {
  const [jobs, setJobs] = useState<any[]>([])
  const [selectedJob, setSelectedJob] = useState<string | null>(null)
  const [entries, setEntries] = useState<any[]>([])
  const [userId] = useState('demo_user') // In production, get from auth
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ message: string; type?: 'success' | 'error' | 'info' } | null>(null)
  const [entriesMode, setEntriesMode] = useState<'all' | 'search'>('all')

  useEffect(() => {
    loadJobs()
  }, [])

  useEffect(() => {
    if (selectedJob) {
      loadEntries(selectedJob)
    }
  }, [selectedJob])

  const loadJobs = async () => {
    try {
      const data = await getJobs(userId)
      setJobs(data)
      if (data.length > 0 && !selectedJob) {
        setSelectedJob(data[0].id)
      }
    } catch (error) {
      console.error('Failed to load jobs:', error)
    }
  }

  const loadEntries = async (jobId: string) => {
    try {
      const data = await getEntries(userId, jobId)
      setEntries(data)
      setEntriesMode('all')
    } catch (error) {
      console.error('Failed to load entries:', error)
    }
  }

  const handleVoiceSubmit = async (transcript: string, extracted?: any) => {
    setLoading(true)
    try {
      if (!selectedJob) {
        // Create a new job from voice input
        const jobName = extractJobName(transcript) || 'New Job'
        const newJob = await createJob({
          user_id: userId,
          name: jobName,
        })
        setJobs([newJob, ...jobs])
        setSelectedJob(newJob.id)
        
        // Create entry for the new job
        await createEntry({
          user_id: userId,
          job_id: newJob.id,
          transcript,
          extracted: extracted || {},
        })
      } else {
        // Add entry to existing job
        await createEntry({
          user_id: userId,
          job_id: selectedJob,
          transcript,
          extracted: extracted || {},
        })
      }
      await loadJobs()
      if (selectedJob) {
        await loadEntries(selectedJob)
      }
    } catch (error) {
      console.error('Failed to submit voice entry:', error)
      setToast({ message: 'Failed to save entry. Please try again.', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleToast = useCallback((message: string, type?: 'success' | 'error' | 'info') => {
    setToast({ message, type })
  }, [])

  const handleVoiceCommand = async (cmd: VoiceCommand) => {
    switch (cmd.type) {
      case 'list_jobs': {
        await loadJobs()
        const names = jobs.map((j) => j.name).slice(0, 6)
        handleToast(names.length ? `Jobs: ${names.join(', ')}${jobs.length > 6 ? '…' : ''}` : 'No jobs yet', 'info')
        return
      }
      case 'create_job': {
        const newJob = await createJob({ user_id: userId, name: cmd.name })
        setJobs((prev) => [newJob, ...prev])
        setSelectedJob(newJob.id)
        handleToast(`Created job: ${newJob.name}`, 'success')
        return
      }
      case 'select_job': {
        const q = cmd.query.toLowerCase()
        const match =
          jobs.find((j) => j.id === cmd.query) ||
          jobs.find((j) => j.name.toLowerCase() === q) ||
          jobs.find((j) => j.name.toLowerCase().includes(q))
        if (!match) {
          handleToast(`Couldn’t find a job matching “${cmd.query}”`, 'error')
          return
        }
        setSelectedJob(match.id)
        handleToast(`Switched to job: ${match.name}`, 'info')
        return
      }
      case 'mark_job_status': {
        if (!selectedJob) {
          handleToast('Select a job first', 'error')
          return
        }
        await updateJob(selectedJob, userId, { status: cmd.status })
        await loadJobs()
        handleToast(`Job marked ${cmd.status.replace('_', ' ')}`, 'success')
        return
      }
      case 'set_job_stage': {
        if (!selectedJob) {
          handleToast('Select a job first', 'error')
          return
        }
        await updateJobState(selectedJob, userId, { stage: cmd.stage })
        await loadJobs()
        handleToast(`Stage set to: ${cmd.stage}`, 'success')
        return
      }
      case 'search_entries': {
        if (!selectedJob) {
          handleToast('Select a job first', 'error')
          return
        }
        const results = await searchEntries(userId, selectedJob, cmd.query, 20)
        setEntries(results)
        setEntriesMode('search')
        handleToast(`Search: ${results.length} result(s) for “${cmd.query}”`, 'info')
        return
      }
      case 'show_entries': {
        if (!selectedJob) return
        await loadEntries(selectedJob)
        handleToast('Showing all entries', 'info')
        return
      }
      case 'save_debrief': {
        if (!selectedJob) {
          handleToast('Select a job first', 'error')
          return
        }
        if (!cmd.transcript.trim()) {
          handleToast('Nothing to debrief yet', 'error')
          return
        }
        await createDebrief(userId, selectedJob, cmd.transcript.trim())
        await loadJobs()
        await loadEntries(selectedJob)
        handleToast('Debrief saved', 'success')
        return
      }
      case 'save_entry': {
        // VoiceRecorder handles save_entry locally by calling onSubmit (so we keep this for type completeness)
        return
      }
      default:
        return
    }
  }

  const extractJobName = (transcript: string): string | null => {
    // Simple heuristic: look for "job" or project name patterns
    const patterns = [
      /(?:job|project|site)\s+(?:at|for|called)\s+([^.!?]+)/i,
      /(?:working on|doing)\s+([^.!?]+)/i,
    ]
    for (const pattern of patterns) {
      const match = transcript.match(pattern)
      if (match && match[1]) {
        return match[1].trim()
      }
    }
    return null
  }

  return (
    <main className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            JobDiary
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Voice-powered job diary for tradies
          </p>
        </div>
        <ThemeToggle />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Voice Recorder - Always visible */}
        <div className="lg:col-span-3">
          <VoiceRecorder 
            onSubmit={handleVoiceSubmit}
            disabled={loading}
            onToast={handleToast}
            onCommand={handleVoiceCommand}
          />
        </div>

        {/* Job List */}
        <div className="lg:col-span-1">
          <JobList
            jobs={jobs}
            selectedJob={selectedJob}
            onSelectJob={setSelectedJob}
            onRefresh={loadJobs}
          />
        </div>

        {/* Entry List */}
        <div className="lg:col-span-2">
          {entriesMode === 'search' && (
            <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              Showing search results. Say “show all entries” to return.
            </div>
          )}
          <EntryList
            entries={entries}
            jobId={selectedJob}
            onRefresh={() => selectedJob && loadEntries(selectedJob)}
          />
        </div>
      </div>

      {/* Toast notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </main>
  )
}
