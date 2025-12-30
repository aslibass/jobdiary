import { NextRequest, NextResponse } from 'next/server'

const JOBDIARY_API_URL = process.env.JOBDIARY_API_URL || 'https://jobdiaryapi-production.up.railway.app'
const JOBDIARY_API_KEY = process.env.JOBDIARY_API_KEY

export async function GET(request: NextRequest) {
  if (!JOBDIARY_API_KEY) {
    return NextResponse.json(
      { error: 'JobDiary API key not configured' },
      { status: 500 }
    )
  }

  const searchParams = request.nextUrl.searchParams
  const userId = searchParams.get('user_id')
  const jobId = searchParams.get('job_id')
  const limit = searchParams.get('limit') || '20'

  if (!userId || !jobId) {
    return NextResponse.json(
      { error: 'user_id and job_id are required' },
      { status: 400 }
    )
  }

  try {
    const response = await fetch(
      `${JOBDIARY_API_URL}/entries?user_id=${userId}&job_id=${jobId}&limit=${limit}`,
      {
        headers: {
          'X-API-Key': JOBDIARY_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
      return NextResponse.json(error, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error fetching entries:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch entries' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  if (!JOBDIARY_API_KEY) {
    return NextResponse.json(
      { error: 'JobDiary API key not configured' },
      { status: 500 }
    )
  }

  try {
    const body = await request.json()

    const response = await fetch(`${JOBDIARY_API_URL}/entries`, {
      method: 'POST',
      headers: {
        'X-API-Key': JOBDIARY_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
      return NextResponse.json(error, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data, { status: 201 })
  } catch (error: any) {
    console.error('Error creating entry:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create entry' },
      { status: 500 }
    )
  }
}

