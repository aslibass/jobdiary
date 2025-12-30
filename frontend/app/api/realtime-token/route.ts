import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY
    
    if (!openaiApiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      )
    }

    // Request ephemeral token from OpenAI using REST API
    // The OpenAI SDK doesn't have a method for this, so we use fetch directly
    const response = await fetch('https://api.openai.com/v1/realtime/ephemeral_keys', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expires_in: 60, // Token expires in 60 seconds
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('OpenAI API error:', response.status, errorText)
      return NextResponse.json(
        { error: `Failed to create ephemeral token: ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    // OpenAI returns ephemeral key in client_secret.value
    const ephemeralKey = data.client_secret?.value || data.value
    
    return NextResponse.json({
      value: ephemeralKey,
      expires_at: data.client_secret?.expires_at || data.expires_at,
    })
  } catch (error: any) {
    console.error('Error creating ephemeral token:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create ephemeral token' },
      { status: 500 }
    )
  }
}

