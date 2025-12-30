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
    // We can optionally configure the session here, or via session.update after WebRTC connection
    // For now, we'll create a basic session and configure it via data channel
    // IMPORTANT:
    // We must set the Realtime model at session-creation time. The WebRTC call is created
    // *before* the data channel opens, so relying on `session.update` alone can leave
    // the session with `model: ""`, which can cause `/v1/realtime/calls` to 400.
    const response = await fetch('https://api.openai.com/v1/realtime/sessions?model=gpt-realtime-mini', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      // No body - session will be configured via session.update after WebRTC connection
      // Some implementations send initial config here, but we configure via data channel
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
    // Based on the actual response, client_secret is an object with a "value" property:
    // { client_secret: { value: "ek_...", expires_at: 1234567890 } }
    let clientSecret: string | null = null
    
    // Try different possible response formats
    if (typeof data === 'string') {
      clientSecret = data
    } else if (typeof data.client_secret === 'string') {
      // Direct string (unlikely but possible)
      clientSecret = data.client_secret
    } else if (data.client_secret && typeof data.client_secret === 'object') {
      // Most common case: client_secret is an object with "value" property
      clientSecret = data.client_secret.value || 
                    data.client_secret.client_secret || 
                    data.client_secret.secret || 
                    data.client_secret.token ||
                    null
    } else if (data.session?.client_secret) {
      if (typeof data.session.client_secret === 'string') {
        clientSecret = data.session.client_secret
      } else if (typeof data.session.client_secret === 'object') {
        clientSecret = data.session.client_secret.value ||
                      data.session.client_secret.client_secret || 
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
    
    // Also return session ID if available (might be needed for call creation)
    const sessionId = data.id || data.session?.id || null
    
    // Return client secret and session ID to the client
    return NextResponse.json({
      client_secret: clientSecret,
      session_id: sessionId, // Include session ID in case it's needed
    })
  } catch (error: any) {
    console.error('Error creating ephemeral token:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create ephemeral token' },
      { status: 500 }
    )
  }
}

