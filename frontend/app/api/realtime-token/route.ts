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

    // Request ephemeral client secret from OpenAI using REST API
    // IMPORTANT: keep your normal API key on the server only
    // Try with ttl_seconds first, if that fails, try without body
    const requestBody = {
      ttl_seconds: 300, // Token expires in 300 seconds (5 minutes) - keep TTL short
    }
    
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { message: errorText }
      }
      console.error('OpenAI API error:', response.status, errorData)
      return NextResponse.json(
        { 
          error: `Failed to create ephemeral token: ${response.status}`,
          details: errorData.message || errorData.error?.message || errorText
        },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    // Return ONLY the client secret to the client
    // OpenAI returns: { client_secret: "..." }
    return NextResponse.json({
      client_secret: data.client_secret,
    })
  } catch (error: any) {
    console.error('Error creating ephemeral token:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create ephemeral token' },
      { status: 500 }
    )
  }
}

