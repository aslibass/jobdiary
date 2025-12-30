# OpenAI Realtime API with WebRTC - Implementation Guide

A secure, production-ready guide for integrating OpenAI's Realtime API using WebRTC with ephemeral tokens. This pattern ensures API keys are never exposed to the browser.

## Security Principles

### ✅ Hard Rules

1. **Never put your main OpenAI API key in the browser**
   - API keys in `NEXT_PUBLIC_*` or client-side code are exposed to users
   - Users can extract keys from browser dev tools
   - Exposed keys can be abused, leading to unexpected costs

2. **Always use ephemeral client secrets**
   - Generate short-lived tokens (60-600 seconds) on the server
   - Pass only the ephemeral token to the browser
   - Ephemeral tokens expire automatically, limiting damage if compromised

3. **Rate-limit your token endpoint**
   - Bind `/realtime-token` to authenticated users
   - Prevent abuse and control costs
   - Monitor token generation rates

## Architecture Overview

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Browser   │         │  Your Server │         │   OpenAI     │
│  (Client)   │         │  (Next.js)    │         │   API        │
└──────┬──────┘         └──────┬───────┘         └──────┬──────┘
       │                        │                        │
       │ 1. GET /realtime-token │                        │
       │───────────────────────>│                        │
       │                        │ 2. POST /v1/realtime/  │
       │                        │    client_secrets      │
       │                        │───────────────────────>│
       │                        │                        │
       │                        │ 3. { client_secret }   │
       │                        │<───────────────────────│
       │ 4. { client_secret }   │                        │
       │<───────────────────────│                        │
       │                        │                        │
       │ 5. WebRTC Connection   │                        │
       │─────────────────────────────────────────────────>│
       │    (using client_secret)                        │
       │                        │                        │
       │ 6. Audio + Events      │                        │
       │<─────────────────────────────────────────────────│
       │                        │                        │
```

## Implementation

### Part 1: Server-Side Ephemeral Token Endpoint

Create a server endpoint that generates ephemeral client secrets.

#### Next.js API Route Example

```typescript
// app/api/realtime-token/route.ts
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

    // Request ephemeral client secret from OpenAI
    // IMPORTANT: keep your normal API key on the server only
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ttl_seconds: 300, // Token expires in 300 seconds (5 minutes) - keep TTL short
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
```

#### Express.js Example

```javascript
// server.js
import express from "express";

const app = express();

app.get("/realtime-token", async (req, res) => {
  try {
    // IMPORTANT: keep your normal API key on the server only
    const r = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // keep TTL short (e.g., 60–600s)
        ttl_seconds: 300,
      }),
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(500).send(text);
    }

    const data = await r.json();
    // Return ONLY the client secret to the client
    res.json({ client_secret: data.client_secret });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.listen(3000, () => console.log("listening on :3000"));
```

#### Security Enhancements

```typescript
// Add rate limiting and authentication
import { rateLimit } from '@/lib/rate-limit'
import { getCurrentUser } from '@/lib/auth'

export async function POST(request: NextRequest) {
  // 1. Authenticate user
  const user = await getCurrentUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Rate limit (e.g., 10 tokens per minute per user)
  const rateLimitResult = await rateLimit(user.id, 10, 60)
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429 }
    )
  }

  // 3. Generate ephemeral token
  // ... (rest of implementation)
}
```

### Part 2: Client-Side WebRTC Implementation

#### Complete Browser Example

```typescript
// components/VoiceRecorder.tsx
'use client'

import { useState, useRef } from 'react'

export default function VoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const clientSecretRef = useRef<string | null>(null)

  async function startRealtime() {
    try {
      // 1) Get ephemeral token from YOUR server
      const tokenResp = await fetch('/api/realtime-token', {
        method: 'POST',
      })
      
      if (!tokenResp.ok) {
        throw new Error('Failed to get ephemeral token')
      }
      
      const { client_secret } = await tokenResp.json()
      clientSecretRef.current = client_secret

      // 2) Create peer connection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      })
      peerConnectionRef.current = pc

      // Play model audio back to user (optional, for speech-to-speech)
      const audioEl = document.createElement('audio')
      audioEl.autoplay = true
      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0]
      }

      // 3) Capture mic
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 24000, // OpenAI Realtime API requires 24kHz
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      mediaStreamRef.current = stream
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))

      // 4) Data channel for realtime events
      // OpenAI requires the channel to be named "oai-events"
      const dc = pc.createDataChannel('oai-events', { ordered: true })
      dataChannelRef.current = dc

      dc.onmessage = (msg) => {
        const evt = JSON.parse(msg.data)
        // Handle events like:
        // - conversation.item.input_audio_transcription.completed
        // - response.audio_transcript.delta
        // - response.audio_transcript.done
        // - input_audio_buffer.speech_started
        // - input_audio_buffer.speech_stopped
        console.log('server event', evt)
        
        if (evt.type === 'conversation.item.input_audio_transcription.completed') {
          setTranscript(prev => prev + ' ' + evt.transcript)
        } else if (evt.type === 'response.audio_transcript.delta') {
          setTranscript(prev => prev + evt.delta)
        }
      }

      // 5) Create an SDP offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // 6) Send SDP to OpenAI Realtime "create call" endpoint
      const answerResp = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${client_secret}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      })

      if (!answerResp.ok) {
        const errorText = await answerResp.text()
        throw new Error(`Failed to create call: ${errorText}`)
      }

      const answerSdp = await answerResp.text()
      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      })

      // 7) Configure session behavior (voice, instructions, turn-taking, etc.)
      dc.onopen = () => {
        // Session updates are done by sending client events over the data channel
        dc.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text'], // or ['text', 'audio'] for speech-to-speech
            instructions: 'You are a transcription assistant. Transcribe accurately.',
            voice: 'alloy', // Options: alloy, echo, fable, onyx, nova, shimmer
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1',
            },
            turn_detection: {
              type: 'server_vad', // Server-side voice activity detection
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
            },
            temperature: 0.8,
            max_response_output_tokens: 4096,
          },
        }))

        // Optional: Ask it to respond (or rely on VAD to auto-respond)
        // dc.send(JSON.stringify({ type: 'response.create' }))
      }

      setIsRecording(true)
    } catch (error) {
      console.error('Failed to start recording:', error)
      // Handle error (show user message, etc.)
    }
  }

  function stopRecording() {
    // Close data channel
    if (dataChannelRef.current) {
      dataChannelRef.current.close()
      dataChannelRef.current = null
    }

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }

    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }

    clientSecretRef.current = null
    setIsRecording(false)
  }

  return (
    <div>
      <button onClick={isRecording ? stopRecording : startRealtime}>
        {isRecording ? 'Stop' : 'Start'} Recording
      </button>
      <div>Transcript: {transcript}</div>
    </div>
  )
}
```

## Key Events to Handle

### Input Audio Transcription Events

```typescript
// Real-time transcription as user speaks
{
  type: 'conversation.item.input_audio_transcription.completed',
  transcript: 'The transcribed text',
  // ... other fields
}

// Partial transcript updates
{
  type: 'response.audio_transcript.delta',
  delta: 'partial text',
}

// Final transcript
{
  type: 'response.audio_transcript.done',
  transcript: 'Complete transcript',
}
```

### Voice Activity Detection Events

```typescript
// User started speaking
{
  type: 'input_audio_buffer.speech_started',
}

// User stopped speaking
{
  type: 'input_audio_buffer.speech_stopped',
}
```

### Session Events

```typescript
// Session configured successfully
{
  type: 'session.updated',
}

// Errors
{
  type: 'error',
  error: {
    message: 'Error description',
    code: 'error_code',
  },
}
```

## Environment Variables

### Server-Side Only (Never `NEXT_PUBLIC_*`)

```env
# OpenAI API key (server-side only)
OPENAI_API_KEY=sk-...

# Your API credentials (if proxying other APIs)
YOUR_API_URL=https://your-api.com
YOUR_API_KEY=your-key-here
```

### ❌ Never Do This

```env
# DON'T expose API keys to the browser!
NEXT_PUBLIC_OPENAI_API_KEY=sk-...  # ❌ BAD
NEXT_PUBLIC_YOUR_API_KEY=...       # ❌ BAD
```

## Best Practices

### 1. Token TTL

- **Recommended**: 300 seconds (5 minutes)
- **Minimum**: 60 seconds
- **Maximum**: 600 seconds (10 minutes)
- **Why**: Balance between security and user experience

### 2. Rate Limiting

```typescript
// Example: 10 tokens per minute per user
const rateLimits = {
  tokensPerMinute: 10,
  tokensPerHour: 100,
}
```

### 3. Error Handling

```typescript
// Handle WebRTC connection errors
pc.oniceconnectionstatechange = () => {
  if (pc.iceConnectionState === 'failed') {
    // Reconnect or show error
    console.error('WebRTC connection failed')
  }
}

// Handle data channel errors
dc.onerror = (error) => {
  console.error('Data channel error:', error)
}
```

### 4. Cleanup

Always clean up resources:

```typescript
function cleanup() {
  // Close data channel
  dataChannelRef.current?.close()
  
  // Close peer connection
  peerConnectionRef.current?.close()
  
  // Stop media tracks
  mediaStreamRef.current?.getTracks().forEach(track => track.stop())
}
```

## Common Pitfalls

### ❌ Pitfall 1: Exposing API Keys

```typescript
// ❌ BAD: API key in client code
const openai = new OpenAI({ 
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY // ❌ Exposed!
})

// ✅ GOOD: Use ephemeral tokens
const tokenResp = await fetch('/api/realtime-token')
const { client_secret } = await tokenResp.json()
```

### ❌ Pitfall 2: Wrong Endpoint

```typescript
// ❌ BAD: Wrong endpoint
fetch('https://api.openai.com/v1/realtime/ephemeral_keys', ...)

// ✅ GOOD: Correct endpoint
fetch('https://api.openai.com/v1/realtime/client_secrets', ...)
```

### ❌ Pitfall 3: Wrong Data Channel Name

```typescript
// ❌ BAD: Custom channel name
const dc = pc.createDataChannel('my-events', ...)

// ✅ GOOD: OpenAI requires 'oai-events'
const dc = pc.createDataChannel('oai-events', ...)
```

### ❌ Pitfall 4: Wrong Audio Format

```typescript
// ❌ BAD: Wrong sample rate
const stream = await getUserMedia({ 
  audio: { sampleRate: 44100 } // ❌ Wrong
})

// ✅ GOOD: 24kHz required
const stream = await getUserMedia({ 
  audio: { 
    sampleRate: 24000, // ✅ Correct
    channelCount: 1,
  }
})
```

## Testing Checklist

- [ ] API key is never in `NEXT_PUBLIC_*` variables
- [ ] Ephemeral token endpoint requires authentication
- [ ] Rate limiting is implemented
- [ ] WebRTC connection establishes successfully
- [ ] Data channel `'oai-events'` is created
- [ ] Transcription events are received
- [ ] Audio format is 24kHz, mono
- [ ] Resources are cleaned up on disconnect
- [ ] Error handling covers all failure cases

## Deployment

### Railway / Vercel / Other Platforms

Set environment variables (server-side only):

```env
OPENAI_API_KEY=sk-...
```

**Never** set `NEXT_PUBLIC_OPENAI_API_KEY` or expose keys to the browser.

### Monitoring

Monitor:
- Token generation rate
- WebRTC connection success rate
- Transcription accuracy
- API costs

## References

- [OpenAI Realtime API Documentation](https://platform.openai.com/docs/guides/realtime)
- [OpenAI Realtime WebRTC Guide](https://platform.openai.com/docs/guides/realtime-webrtc)
- [WebRTC API Reference](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)

## License

This guide is part of the JobDiary project. See LICENSE file for details.

