import { NextRequest, NextResponse } from 'next/server'

const JOBDIARY_API_URL = process.env.JOBDIARY_API_URL || 'https://jobdiaryapi-production.up.railway.app'
const JOBDIARY_API_KEY = process.env.JOBDIARY_API_KEY

if (!JOBDIARY_API_KEY) {
  console.warn('JOBDIARY_API_KEY not configured')
}

export async function GET(request: NextRequest) {
  if (!JOBDIARY_API_KEY) {
    return NextResponse.json(
      { error: 'JobDiary API key not configured' },
      { status: 500 }
    )
  }

  const searchParams = request.nextUrl.searchParams
  const userId = searchParams.get('user_id')
  const limit = searchParams.get('limit') || '20'

  if (!userId) {
    return NextResponse.json(
      { error: 'user_id is required' },
      { status: 400 }
    )
  }

  try {
    const response = await fetch(
      `${JOBDIARY_API_URL}/jobs?user_id=${userId}&limit=${limit}`,
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
    console.error('Error fetching jobs:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch jobs' },
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

    const response = await fetch(`${JOBDIARY_API_URL}/jobs`, {
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
    console.error('Error creating job:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create job' },
      { status: 500 }
    )
  }
}

