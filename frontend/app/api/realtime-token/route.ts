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

    // Request ephemeral session from OpenAI using REST API
    // IMPORTANT: keep your normal API key on the server only
    // Based on OpenAI's official realtime-agents repo pattern
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      // Sessions endpoint may not require a body, or may accept optional config
      // If body is needed, it would be session configuration
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
    
    // OpenAI sessions endpoint returns ephemeral session token
    // Format may be: { client_secret: "..." } or { session: { client_secret: "..." } }
    const clientSecret = data.client_secret || data.session?.client_secret || data.token
    
    if (!clientSecret) {
      console.error('Unexpected response format:', data)
      return NextResponse.json(
        { error: 'Unexpected response format from OpenAI' },
        { status: 500 }
      )
    }
    
    // Return ONLY the client secret to the client
    return NextResponse.json({
      client_secret: clientSecret,
    })
  } catch (error: any) {
    console.error('Error creating ephemeral token:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create ephemeral token' },
      { status: 500 }
    )
  }
}

