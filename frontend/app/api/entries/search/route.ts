import { NextRequest, NextResponse } from 'next/server'

const JOBDIARY_API_URL = (process.env.JOBDIARY_API_URL || 'https://jobdiaryapi-production.up.railway.app').replace(/\/+$/, '')
const JOBDIARY_API_KEY = process.env.JOBDIARY_API_KEY

export async function POST(request: NextRequest) {
  if (!JOBDIARY_API_KEY) {
    return NextResponse.json(
      { error: 'JobDiary API key not configured' },
      { status: 500 }
    )
  }

  try {
    const body = await request.json()
    const { user_id, job_id, query, limit } = body

    if (!user_id || !job_id || !query) {
      return NextResponse.json(
        { error: 'user_id, job_id, and query are required' },
        { status: 400 }
      )
    }

    const response = await fetch(`${JOBDIARY_API_URL}/entries/search`, {
      method: 'POST',
      headers: {
        'X-API-Key': JOBDIARY_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id,
        job_id,
        query,
        limit: limit || 10,
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
      return NextResponse.json(error, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error searching entries:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to search entries' },
      { status: 500 }
    )
  }
}

