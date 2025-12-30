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
       │ 1. POST /realtime-token│                        │
       │───────────────────────>│                        │
       │                        │ 2. POST /v1/realtime/  │
       │                        │    sessions            │
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

    // Request ephemeral session from OpenAI
    // IMPORTANT: Use POST body to specify model (required for the session)
    // Based on OpenAI's official realtime-agents repo: https://github.com/openai/openai-realtime-agents
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-realtime-mini', // REQUIRED: specify model in session creation
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('OpenAI API error:', response.status, errorText)
      return NextResponse.json(
        { error: `Failed to create ephemeral token: ${response.status}`, details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    // OpenAI sessions endpoint returns { client_secret: { value: "ek_...", expires_at: ... }, ... }
    // or older format: { client_secret: "ek_..." }
    let clientSecret: string
    if (typeof data.client_secret === 'object' && data.client_secret?.value) {
      clientSecret = data.client_secret.value
    } else if (typeof data.client_secret === 'string') {
      clientSecret = data.client_secret
    } else {
      console.error('Unexpected response format:', data)
      return NextResponse.json(
        { error: 'Unexpected response format from OpenAI' },
        { status: 500 }
      )
    }
    
    // Return ONLY the client secret to the client
    return NextResponse.json({
      client_secret: clientSecret,
      session_id: data.id, // Optional: useful for debugging
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

app.post("/realtime-token", async (req, res) => {
  try {
    // IMPORTANT: keep your normal API key on the server only
    const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-realtime-mini", // REQUIRED
      }),
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(500).send(text);
    }

    const data = await r.json();
    
    // Handle both response formats
    const clientSecret = typeof data.client_secret === 'object' 
      ? data.client_secret.value 
      : data.client_secret;
      
    res.json({ client_secret: clientSecret });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.listen(3000, () => console.log("listening on :3000"));
```

### Part 2: Client-Side WebRTC Implementation

#### Complete Browser Example with Race Condition Protection

The most critical issue in WebRTC implementations is **stale event handlers**. When a recording session is stopped and a new one starts, old event handlers can fire and corrupt the new session's state.

```typescript
// components/VoiceRecorder.tsx
'use client'

import { useState, useRef } from 'react'

export default function VoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  
  // Refs for WebRTC resources
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const clientSecretRef = useRef<string | null>(null)
  
  // CRITICAL: Flags to prevent race conditions
  const startLockRef = useRef<boolean>(false)        // Prevent double-start
  const stopRequestedRef = useRef<boolean>(false)    // Track intentional stops

  async function startRealtime() {
    // CRITICAL: Prevent double-start (mobile can fire multiple events quickly)
    if (startLockRef.current) return
    if (isRecording || isConnecting) return
    startLockRef.current = true
    
    setError(null)
    setIsConnecting(true)
    stopRequestedRef.current = false  // Reset stop flag for new session

    try {
      // 1) Get ephemeral token from YOUR server
      const tokenResp = await fetch('/api/realtime-token', { method: 'POST' })
      
      if (!tokenResp.ok) {
        const err = await tokenResp.json()
        throw new Error(err.error || 'Failed to get ephemeral token')
      }
      
      const { client_secret } = await tokenResp.json()
      
      if (!client_secret || typeof client_secret !== 'string') {
        throw new Error('Invalid client_secret received')
      }
      
      clientSecretRef.current = client_secret

      // 2) Capture mic BEFORE creating peer connection
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 24000, // OpenAI Realtime API requires 24kHz
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      mediaStreamRef.current = stream

      // 3) Create peer connection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      })
      peerConnectionRef.current = pc

      // CRITICAL: Check for stale handlers in all event callbacks
      pc.onconnectionstatechange = () => {
        // Ignore events from stale peer connections
        if (peerConnectionRef.current !== pc) return
        console.log('PC connectionState:', pc.connectionState)
        
        if (!stopRequestedRef.current && 
            (pc.connectionState === 'failed' || 
             pc.connectionState === 'disconnected' || 
             pc.connectionState === 'closed')) {
          setError(`Connection ${pc.connectionState}`)
          setIsConnecting(false)
          setIsRecording(false)
        }
      }

      pc.oniceconnectionstatechange = () => {
        if (peerConnectionRef.current !== pc) return
        console.log('PC iceConnectionState:', pc.iceConnectionState)
      }

      // Play model audio back to user (for two-way conversation)
      const audioEl = document.createElement('audio')
      audioEl.autoplay = true
      pc.ontrack = (e) => {
        if (peerConnectionRef.current !== pc) return
        audioEl.srcObject = e.streams[0]
      }

      // Add audio track
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))

      // 4) Create data channel - MUST be named 'oai-events'
      const dc = pc.createDataChannel('oai-events', { ordered: true })
      dataChannelRef.current = dc

      dc.onerror = (e) => {
        if (dataChannelRef.current !== dc) return
        console.error('Data channel error', e)
      }

      // CRITICAL: Check for stale data channel before handling close
      dc.onclose = () => {
        console.log('Data channel closed')
        // Ignore close events from stale data channels (previous sessions)
        if (dataChannelRef.current !== dc) {
          console.log('Ignoring stale data channel close')
          return
        }
        if (!stopRequestedRef.current) {
          setError('Connection closed unexpectedly')
          setIsConnecting(false)
          setIsRecording(false)
        }
      }

      dc.onmessage = (msg) => {
        if (dataChannelRef.current !== dc) return
        const evt = JSON.parse(msg.data)
        console.debug('Realtime event:', evt.type)
        
        // Handle transcription events
        if (evt.type === 'conversation.item.input_audio_transcription.completed') {
          setTranscript(prev => prev + ' ' + evt.transcript)
        } else if (evt.type === 'response.audio_transcript.delta') {
          // Streaming assistant response
        } else if (evt.type === 'error') {
          console.error('Realtime API error:', evt)
          setError(evt.error?.message || 'Transcription error')
        }
      }

      dc.onopen = () => {
        if (dataChannelRef.current !== dc) return
        console.log('Data channel opened')
        
        // Configure session for two-way conversation
        dc.send(JSON.stringify({
          type: 'session.update',
          session: {
            model: 'gpt-realtime-mini',
            modalities: ['text', 'audio'], // Enable both for speech-to-speech
            instructions: 'You are a helpful assistant.',
            voice: 'alloy',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1',
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
              idle_timeout_ms: 30000,
            },
            temperature: 0.8,
            max_response_output_tokens: 4096,
          },
        }))
      }

      // 5) Create SDP offer - don't wait for ICE gathering
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      })
      await pc.setLocalDescription(offer)

      // 6) Send SDP to OpenAI Realtime "calls" endpoint
      const answerResp = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${client_secret}`,
          'Content-Type': 'application/sdp',
          'OpenAI-Beta': 'realtime=v1', // May be required
        },
        body: offer.sdp,
      })

      if (!answerResp.ok) {
        const errorText = await answerResp.text()
        throw new Error(`Failed to create call: ${errorText}`)
      }

      // 7) Set remote description
      const answerSdp = await answerResp.text()
      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      })

      setIsConnecting(false)
      setIsRecording(true)
      
    } catch (err: any) {
      console.error('Failed to start recording:', err)
      setError(err.message || 'Failed to start recording')
      setIsConnecting(false)
      stopRecording()
    } finally {
      startLockRef.current = false
    }
  }

  function stopRecording() {
    startLockRef.current = false
    stopRequestedRef.current = true  // Mark this as intentional stop
    
    // CRITICAL: Nullify refs BEFORE closing to prevent stale handler issues
    // This ensures any async close events see null and bail out
    
    if (dataChannelRef.current) {
      const dc = dataChannelRef.current
      dataChannelRef.current = null  // Nullify first!
      dc.close()
    }

    if (peerConnectionRef.current) {
      const pc = peerConnectionRef.current
      peerConnectionRef.current = null  // Nullify first!
      pc.close()
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }

    clientSecretRef.current = null
    setIsRecording(false)
    setIsConnecting(false)
  }

  return (
    <div>
      <button 
        onClick={isRecording ? stopRecording : startRealtime}
        disabled={isConnecting}
      >
        {isConnecting ? 'Connecting...' : isRecording ? 'Stop' : 'Start'} Recording
      </button>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <div>Transcript: {transcript}</div>
    </div>
  )
}
```

## Critical: Avoiding Stale Event Handler Bugs

### The Problem

WebRTC event handlers (onclose, onmessage, onconnectionstatechange) fire **asynchronously**. If you stop one recording session and start another quickly:

1. Old session's `dataChannel.onclose` might fire AFTER new session starts
2. The `stopRequestedRef` flag has been reset to `false` for the new session
3. Old handler sees `stopRequestedRef === false` and thinks it's an unexpected close
4. Handler sets `isRecording = false`, killing the new session

### The Solution

**Check that the handler belongs to the current connection:**

```typescript
// ✅ GOOD: Check ref before handling event
dc.onclose = () => {
  if (dataChannelRef.current !== dc) {
    console.log('Ignoring stale data channel close')
    return  // This is from an old session, ignore it
  }
  // Handle actual unexpected close...
}

// ✅ GOOD: Nullify ref BEFORE closing
function stopRecording() {
  if (dataChannelRef.current) {
    const dc = dataChannelRef.current
    dataChannelRef.current = null  // Nullify FIRST
    dc.close()  // Then close (handler will see null and bail)
  }
}
```

```typescript
// ❌ BAD: Close first, then nullify
function stopRecording() {
  if (dataChannelRef.current) {
    dataChannelRef.current.close()  // Handler fires...
    dataChannelRef.current = null   // ...but ref isn't null yet!
  }
}
```

### Apply to ALL Event Handlers

```typescript
pc.onconnectionstatechange = () => {
  if (peerConnectionRef.current !== pc) return  // Stale check
  // ...
}

pc.oniceconnectionstatechange = () => {
  if (peerConnectionRef.current !== pc) return  // Stale check
  // ...
}

pc.ontrack = (e) => {
  if (peerConnectionRef.current !== pc) return  // Stale check
  // ...
}

dc.onopen = () => {
  if (dataChannelRef.current !== dc) return  // Stale check
  // ...
}

dc.onclose = () => {
  if (dataChannelRef.current !== dc) return  // Stale check
  // ...
}

dc.onmessage = (msg) => {
  if (dataChannelRef.current !== dc) return  // Stale check
  // ...
}

dc.onerror = (e) => {
  if (dataChannelRef.current !== dc) return  // Stale check
  // ...
}
```

## Key Events to Handle

### Input Audio Transcription Events

```typescript
// Real-time transcription as user speaks
{
  type: 'conversation.item.input_audio_transcription.completed',
  transcript: 'The transcribed text',
}

// Partial transcript updates (assistant speaking)
{
  type: 'response.audio_transcript.delta',
  delta: 'partial text',
}

// Final transcript (assistant)
{
  type: 'response.audio_transcript.done',
  transcript: 'Complete transcript',
}

// Text response (if modalities includes 'text')
{
  type: 'response.text.delta',
  delta: 'partial text',
}

{
  type: 'response.text.done',
  text: 'Complete text',
}
```

### Voice Activity Detection Events

```typescript
// User started speaking
{
  type: 'input_audio_buffer.speech_started',
  audio_start_ms: 1234,
}

// User stopped speaking
{
  type: 'input_audio_buffer.speech_stopped',
  audio_end_ms: 5678,
}

// Audio buffer committed (after speech ends)
{
  type: 'input_audio_buffer.committed',
}

// Idle timeout (no speech for idle_timeout_ms)
{
  type: 'input_audio_buffer.timeout_triggered',
}
```

### Session Events

```typescript
// Session created
{
  type: 'session.created',
  session: { /* session config */ },
}

// Session configured successfully
{
  type: 'session.updated',
  session: { /* updated config */ },
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

## Session Configuration Options

### Modalities

```typescript
// Text-only (transcription only, no speech output)
modalities: ['text']

// Audio-only (speech-to-speech, no text)
modalities: ['audio']

// Both (two-way conversation with transcripts)
modalities: ['text', 'audio']
```

### Turn Detection

```typescript
turn_detection: {
  type: 'server_vad',           // Server-side voice activity detection
  threshold: 0.5,               // Sensitivity (0.0 to 1.0)
  prefix_padding_ms: 300,       // Audio to include before detected speech
  silence_duration_ms: 500,     // Silence duration to end turn
  idle_timeout_ms: 30000,       // Timeout after assistant response
}
```

### Voice Options

Available voices: `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`

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

## Common Pitfalls

### ❌ Pitfall 1: Stale Event Handlers (Most Common Bug!)

```typescript
// ❌ BAD: No stale check - old sessions can corrupt new ones
dc.onclose = () => {
  if (!stopRequestedRef.current) {
    setIsRecording(false)  // Might kill a new session!
  }
}

// ✅ GOOD: Check that this is still the current data channel
dc.onclose = () => {
  if (dataChannelRef.current !== dc) return  // Ignore stale
  if (!stopRequestedRef.current) {
    setIsRecording(false)
  }
}
```

### ❌ Pitfall 2: Wrong Cleanup Order

```typescript
// ❌ BAD: Nullify after close - handler fires before null check
dataChannelRef.current.close()
dataChannelRef.current = null

// ✅ GOOD: Nullify before close - handler sees null immediately
const dc = dataChannelRef.current
dataChannelRef.current = null
dc.close()
```

### ❌ Pitfall 3: Missing Model in Session Creation

```typescript
// ❌ BAD: No model specified - will return 400 or empty model
await fetch('https://api.openai.com/v1/realtime/sessions', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` },
})

// ✅ GOOD: Specify model in request body
await fetch('https://api.openai.com/v1/realtime/sessions', {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ model: 'gpt-realtime-mini' }),
})
```

### ❌ Pitfall 4: Wrong Endpoint

```typescript
// ❌ BAD: These endpoints may not exist or have different behavior
fetch('https://api.openai.com/v1/realtime/ephemeral_keys', ...)
fetch('https://api.openai.com/v1/realtime/client_secrets', ...)

// ✅ GOOD: Use the sessions endpoint
fetch('https://api.openai.com/v1/realtime/sessions', ...)
```

### ❌ Pitfall 5: Wrong Data Channel Name

```typescript
// ❌ BAD: Custom channel name
const dc = pc.createDataChannel('my-events', ...)

// ✅ GOOD: OpenAI requires 'oai-events'
const dc = pc.createDataChannel('oai-events', ...)
```

### ❌ Pitfall 6: Wrong Audio Format

```typescript
// ❌ BAD: Wrong sample rate
const stream = await getUserMedia({ 
  audio: { sampleRate: 44100 }
})

// ✅ GOOD: 24kHz required
const stream = await getUserMedia({ 
  audio: { 
    sampleRate: 24000,
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
  }
})
```

### ❌ Pitfall 7: Double-Start on Mobile

```typescript
// ❌ BAD: No lock - mobile touch events can fire multiple times
async function startRecording() {
  if (isRecording) return
  // ... user taps twice quickly, two sessions start
}

// ✅ GOOD: Use a ref-based lock
const startLockRef = useRef(false)

async function startRecording() {
  if (startLockRef.current) return
  startLockRef.current = true
  try {
    // ... start session
  } finally {
    startLockRef.current = false
  }
}
```

## Testing Checklist

- [ ] API key is never in `NEXT_PUBLIC_*` variables
- [ ] Ephemeral token endpoint requires authentication (in production)
- [ ] Rate limiting is implemented (in production)
- [ ] Model is specified in session creation request body
- [ ] WebRTC connection establishes successfully
- [ ] Data channel `'oai-events'` is created
- [ ] All event handlers have stale checks
- [ ] Cleanup nullifies refs before closing
- [ ] Start has a lock to prevent double-triggering
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
- Data channel open/close events
- Transcription accuracy
- API costs

## References

- [OpenAI Realtime API Documentation](https://platform.openai.com/docs/guides/realtime)
- [OpenAI Realtime WebRTC Guide](https://platform.openai.com/docs/guides/realtime-webrtc)
- [OpenAI Realtime Agents Example](https://github.com/openai/openai-realtime-agents)
- [WebRTC API Reference](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)

## License

This guide is part of the JobDiary project. See LICENSE file for details.
