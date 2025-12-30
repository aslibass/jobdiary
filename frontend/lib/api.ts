import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://jobdiaryapi-production.up.railway.app'
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || ''

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json',
  },
})

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
  const response = await api.get('/jobs', {
    params: { user_id: userId, limit },
  })
  return response.data
}

export async function getJob(jobId: string, userId: string): Promise<Job> {
  const response = await api.get(`/jobs/${jobId}`, {
    params: { user_id: userId },
  })
  return response.data
}

export async function createJob(data: JobCreate): Promise<Job> {
  const response = await api.post('/jobs', data)
  return response.data
}

export async function updateJob(
  jobId: string,
  userId: string,
  data: Partial<Job>
): Promise<Job> {
  const response = await api.patch(`/jobs/${jobId}`, data, {
    params: { user_id: userId },
  })
  return response.data
}

// Entries
export async function getEntries(
  userId: string,
  jobId: string,
  limit: number = 20
): Promise<Entry[]> {
  const response = await api.get('/entries', {
    params: { user_id: userId, job_id: jobId, limit },
  })
  return response.data
}

export async function createEntry(data: EntryCreate): Promise<Entry> {
  const response = await api.post('/entries', data)
  return response.data
}

// Search
export async function searchEntries(
  userId: string,
  jobId: string,
  query: string,
  limit: number = 10
): Promise<Entry[]> {
  const response = await api.post('/entries/search', {
    user_id: userId,
    job_id: jobId,
    query,
    limit,
  })
  return response.data
}

// Debrief
export async function createDebrief(
  userId: string,
  jobNameOrId: string,
  transcript: string
): Promise<{ job: Job; entry: Entry }> {
  const response = await api.post('/debrief', {
    user_id: userId,
    job_name_or_id: jobNameOrId,
    transcript,
  })
  return response.data
}

