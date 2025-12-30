import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(request: NextRequest) {
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY
    
    if (!openaiApiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      )
    }

    const openai = new OpenAI({ apiKey: openaiApiKey })

    // Request ephemeral token from OpenAI
    // Note: Check OpenAI SDK docs for exact method name
    // This may need to be adjusted based on actual SDK version
    const response = await openai.realtime.ephemeralKeys.create({
      expires_in: 60, // Token expires in 60 seconds
    })

    // OpenAI returns ephemeral key - format may vary by SDK version
    const ephemeralKey = response.client_secret?.value || response.value || response.client_secret
    
    return NextResponse.json({
      value: ephemeralKey,
      expires_at: response.client_secret?.expires_at || response.expires_at,
    })
  } catch (error: any) {
    console.error('Error creating ephemeral token:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create ephemeral token' },
      { status: 500 }
    )
  }
}

