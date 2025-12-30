// Client-side API functions - all calls go through Next.js API routes
// No API keys exposed to browser

const API_BASE = '/api'

export interface Job {
  id: string
  user_id: string
  name: string
  address?: string
  client_name?: string
  status: string
  job_state: Record<string, any>
  created_at: string
  updated_at: string
}

export interface Entry {
  id: string
  job_id: string
  user_id: string
  entry_ts: string
  transcript: string
  extracted: Record<string, any>
  summary?: string
  created_at: string
}

export interface JobCreate {
  user_id: string
  name: string
  address?: string
  client_name?: string
}

export interface EntryCreate {
  user_id: string
  job_id: string
  transcript: string
  extracted?: Record<string, any>
  summary?: string
  entry_ts?: string
}

// Jobs
export async function getJobs(userId: string, limit: number = 20): Promise<Job[]> {
  const response = await fetch(`${API_BASE}/jobs?user_id=${userId}&limit=${limit}`)
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch jobs')
  }
  return response.json()
}

export async function getJob(jobId: string, userId: string): Promise<Job> {
  const response = await fetch(`${API_BASE}/jobs/${jobId}?user_id=${userId}`)
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch job')
  }
  return response.json()
}

export async function createJob(data: JobCreate): Promise<Job> {
  const response = await fetch(`${API_BASE}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to create job')
  }
  return response.json()
}

export async function updateJob(
  jobId: string,
  userId: string,
  data: Partial<Job>
): Promise<Job> {
  const response = await fetch(`${API_BASE}/jobs/${jobId}?user_id=${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update job')
  }
  return response.json()
}

export async function updateJobState(
  jobId: string,
  userId: string,
  patch: Record<string, any>
): Promise<{ ok: boolean; updated_at: string }> {
  const response = await fetch(`${API_BASE}/jobs/${jobId}/state?user_id=${userId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patch }),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update job state')
  }
  return response.json()
}

// Entries
export async function getEntries(
  userId: string,
  jobId: string,
  limit: number = 20
): Promise<Entry[]> {
  const response = await fetch(
    `${API_BASE}/entries?user_id=${userId}&job_id=${jobId}&limit=${limit}`
  )
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch entries')
  }
  return response.json()
}

export async function createEntry(data: EntryCreate): Promise<Entry> {
  const response = await fetch(`${API_BASE}/entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to create entry')
  }
  return response.json()
}

// Search
export async function searchEntries(
  userId: string,
  jobId: string,
  query: string,
  limit: number = 10
): Promise<Entry[]> {
  const response = await fetch(`${API_BASE}/entries/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      job_id: jobId,
      query,
      limit,
    }),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to search entries')
  }
  return response.json()
}

// Debrief
export async function createDebrief(
  userId: string,
  jobNameOrId: string,
  transcript: string
): Promise<{ job: Job; entry: Entry }> {
  const response = await fetch(`${API_BASE}/debrief`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      job_name_or_id: jobNameOrId,
      transcript,
    }),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to create debrief')
  }
  return response.json()
}
