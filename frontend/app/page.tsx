'use client'

import { useState, useEffect } from 'react'
import VoiceRecorder from '@/components/VoiceRecorder'
import JobList from '@/components/JobList'
import EntryList from '@/components/EntryList'
import ThemeToggle from '@/components/ThemeToggle'
import { getJobs, createJob, createEntry } from '@/lib/api'

export default function Home() {
  const [jobs, setJobs] = useState<any[]>([])
  const [selectedJob, setSelectedJob] = useState<string | null>(null)
  const [entries, setEntries] = useState<any[]>([])
  const [userId] = useState('demo_user') // In production, get from auth
  const [loading, setLoading] = useState(false)

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
      const data = await getEntries(jobId)
      setEntries(data)
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
      alert('Failed to save entry. Please try again.')
    } finally {
      setLoading(false)
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
          <EntryList
            entries={entries}
            jobId={selectedJob}
            onRefresh={() => selectedJob && loadEntries(selectedJob)}
          />
        </div>
      </div>
    </main>
  )
}

// Import getEntries
async function getEntries(jobId: string) {
  const { getEntries } = await import('@/lib/api')
  return getEntries('demo_user', jobId)
}

