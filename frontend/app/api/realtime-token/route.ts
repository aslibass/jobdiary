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
    // Based on OpenAI's official realtime-agents repo: https://github.com/openai/openai-realtime-agents
    // The sessions endpoint creates an ephemeral session token
    // Model is configured via session.update in the client after WebRTC connection
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      // No body needed - session configuration happens via session.update after connection
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
    console.log('OpenAI sessions response:', JSON.stringify(data, null, 2))
    
    // OpenAI sessions endpoint returns ephemeral session token
    // The response format can vary - handle multiple possible structures
    let clientSecret: string | null = null
    
    // Try different possible response formats
    if (typeof data === 'string') {
      clientSecret = data
    } else if (typeof data.client_secret === 'string') {
      clientSecret = data.client_secret
    } else if (data.client_secret && typeof data.client_secret === 'object') {
      // If client_secret is an object, try to extract the actual secret
      clientSecret = data.client_secret.client_secret || 
                    data.client_secret.secret || 
                    data.client_secret.token ||
                    data.client_secret.value ||
                    null
    } else if (data.session?.client_secret) {
      if (typeof data.session.client_secret === 'string') {
        clientSecret = data.session.client_secret
      } else if (typeof data.session.client_secret === 'object') {
        clientSecret = data.session.client_secret.client_secret || 
                      data.session.client_secret.secret || 
                      data.session.client_secret.token ||
                      null
      }
    } else if (data.token && typeof data.token === 'string') {
      clientSecret = data.token
    } else if (data.client_secrets?.client_secret) {
      clientSecret = data.client_secrets.client_secret
    }
    
    if (!clientSecret || typeof clientSecret !== 'string') {
      console.error('Unexpected response format from OpenAI:', JSON.stringify(data, null, 2))
      console.error('client_secret type:', typeof data.client_secret, 'value:', data.client_secret)
      return NextResponse.json(
        { 
          error: 'Unexpected response format from OpenAI',
          details: `Could not extract client_secret string. Response: ${JSON.stringify(data)}`
        },
        { status: 500 }
      )
    }
    
    console.log('Successfully extracted client_secret (length:', clientSecret.length, ')')
    
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

