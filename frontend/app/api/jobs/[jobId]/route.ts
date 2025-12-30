import { NextRequest, NextResponse } from 'next/server'

const JOBDIARY_API_URL = (process.env.JOBDIARY_API_URL || 'https://jobdiaryapi-production.up.railway.app').replace(/\/+$/, '')
const JOBDIARY_API_KEY = process.env.JOBDIARY_API_KEY

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  if (!JOBDIARY_API_KEY) {
    return NextResponse.json(
      { error: 'JobDiary API key not configured' },
      { status: 500 }
    )
  }

  const searchParams = request.nextUrl.searchParams
  const userId = searchParams.get('user_id')

  if (!userId) {
    return NextResponse.json(
      { error: 'user_id is required' },
      { status: 400 }
    )
  }

  try {
    const response = await fetch(
      `${JOBDIARY_API_URL}/jobs/${params.jobId}?user_id=${userId}`,
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
    console.error('Error fetching job:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch job' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  if (!JOBDIARY_API_KEY) {
    return NextResponse.json(
      { error: 'JobDiary API key not configured' },
      { status: 500 }
    )
  }

  const searchParams = request.nextUrl.searchParams
  const userId = searchParams.get('user_id')

  if (!userId) {
    return NextResponse.json(
      { error: 'user_id is required' },
      { status: 400 }
    )
  }

  try {
    const body = await request.json()

    const response = await fetch(
      `${JOBDIARY_API_URL}/jobs/${params.jobId}?user_id=${userId}`,
      {
        method: 'PATCH',
        headers: {
          'X-API-Key': JOBDIARY_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
      return NextResponse.json(error, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error updating job:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update job' },
      { status: 500 }
    )
  }
}

