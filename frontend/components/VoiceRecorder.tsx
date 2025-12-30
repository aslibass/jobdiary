'use client'

import { useState, useEffect, useRef } from 'react'

interface VoiceRecorderProps {
  onSubmit: (transcript: string, extracted?: any) => void
  disabled?: boolean
}

export default function VoiceRecorder({ onSubmit, disabled }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const accumulatedTranscriptRef = useRef<string>('')
  const ephemeralTokenRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      stopRecording()
    }
  }, [])

  const startRecording = async () => {
    if (isRecording || disabled) return

    setError(null)
    setIsConnecting(true)
    accumulatedTranscriptRef.current = ''

    try {
      // Step 1: Get ephemeral token from our server
      const tokenResponse = await fetch('/api/realtime-token', {
        method: 'POST',
      })

      if (!tokenResponse.ok) {
        const error = await tokenResponse.json()
        throw new Error(error.error || 'Failed to get ephemeral token')
      }

      const tokenData = await tokenResponse.json()
      // Server returns: { client_secret: "..." }
      ephemeralTokenRef.current = tokenData.client_secret

      // Step 2: Get user's microphone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 24000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      mediaStreamRef.current = stream

      // Step 3: Create RTCPeerConnection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      })
      peerConnectionRef.current = pc

      // Add audio track
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream)
      })

      // Step 4: Create data channel for transcription events
      // OpenAI Realtime API uses 'oai-events' as the data channel name
      const dataChannel = pc.createDataChannel('oai-events', { ordered: true })
      dataChannelRef.current = dataChannel

      dataChannel.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          // Handle transcription events
          if (data.type === 'conversation.item.input_audio_transcription.completed') {
            const newText = data.transcript
            if (newText) {
              accumulatedTranscriptRef.current += newText + ' '
              setTranscript(accumulatedTranscriptRef.current.trim())
            }
          } else if (data.type === 'response.audio_transcript.delta') {
            const delta = data.delta
            if (delta) {
              accumulatedTranscriptRef.current += delta
              setTranscript(accumulatedTranscriptRef.current.trim())
            }
          } else if (data.type === 'response.audio_transcript.done') {
            const final = data.transcript
            if (final) {
              accumulatedTranscriptRef.current = final
              setTranscript(final)
            }
          } else if (data.type === 'error') {
            console.error('OpenAI Realtime API error:', data)
            setError(data.error?.message || 'An error occurred with transcription')
            stopRecording()
          }
        } catch (err) {
          console.error('Error parsing data channel message:', err)
        }
      }

      dataChannel.onopen = () => {
        console.log('Data channel opened')
        // Configure session via data channel
        dataChannel.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text'],
            instructions: 'You are a transcription assistant for a job diary app. Transcribe the user\'s speech accurately. Only provide the transcript, no commentary.',
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
            },
            temperature: 0.8,
            max_response_output_tokens: 4096,
          },
        }))
      }

      // Step 5: Create SDP offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // Step 6: Send SDP offer to OpenAI Realtime API
      const sdpResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ephemeralTokenRef.current}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      })

      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text()
        throw new Error(`Failed to create call: ${errorText}`)
      }

      // Step 7: Set SDP answer as remote description
      const answerSdp = await sdpResponse.text()
      const answer = {
        type: 'answer' as RTCSdpType,
        sdp: answerSdp,
      }
      await pc.setRemoteDescription(answer)

      setIsConnecting(false)
      setIsRecording(true)
      setTranscript('')

    } catch (err: any) {
      console.error('Failed to start recording:', err)
      setError(err.message || 'Failed to start recording. Please check microphone permissions.')
      setIsConnecting(false)
      stopRecording()
    }
  }

  const stopRecording = () => {
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

    ephemeralTokenRef.current = null
    setIsRecording(false)
    setIsConnecting(false)
  }

  const handleSubmit = async () => {
    if (!transcript.trim()) return

    setIsProcessing(true)
    try {
      // Extract structured data from transcript
      const extracted = extractStructuredData(transcript)
      await onSubmit(transcript.trim(), extracted)
      setTranscript('')
      accumulatedTranscriptRef.current = ''
    } catch (error) {
      console.error('Submit error:', error)
      setError('Failed to save entry. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const extractStructuredData = (text: string): Record<string, any> => {
    const extracted: Record<string, any> = {}

    // Extract tasks completed
    const taskPatterns = [
      /(?:completed|finished|done)\s+([^.!?]+)/gi,
      /(?:installed|built|fixed)\s+([^.!?]+)/gi,
    ]
    const tasks: string[] = []
    taskPatterns.forEach((pattern) => {
      const matches = text.matchAll(pattern)
      for (const match of matches) {
        tasks.push(match[1].trim())
      }
    })
    if (tasks.length > 0) {
      extracted.tasks_completed = tasks
    }

    // Extract next actions
    const nextPatterns = [
      /(?:need to|will|should|next)\s+([^.!?]+)/gi,
      /(?:tomorrow|next week|later)\s+([^.!?]+)/gi,
    ]
    const nextActions: string[] = []
    nextPatterns.forEach((pattern) => {
      const matches = text.matchAll(pattern)
      for (const match of matches) {
        nextActions.push(match[1].trim())
      }
    })
    if (nextActions.length > 0) {
      extracted.next_actions = nextActions
    }

    // Extract materials
    const materialPattern =
      /(?:need|ordered|used)\s+(?:the\s+)?([^.!?]+?)\s+(?:materials?|supplies?|parts?)/gi
    const materials: string[] = []
    const materialMatches = text.matchAll(materialPattern)
    for (const match of materialMatches) {
      materials.push(match[1].trim())
    }
    if (materials.length > 0) {
      extracted.materials = materials
    }

    return extracted
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-xl font-semibold mb-4">
        Voice Diary Entry (OpenAI Realtime WebRTC)
      </h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-2 text-xs text-red-600 hover:text-red-800 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="mb-4">
        <div className="flex items-center justify-center gap-4 mb-4">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={disabled || isProcessing || isConnecting}
            className={`
              w-20 h-20 rounded-full flex items-center justify-center
              transition-all duration-200
              ${
                isRecording
                  ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                  : 'bg-primary-500 hover:bg-primary-600'
              }
              ${
                disabled || isProcessing || isConnecting
                  ? 'opacity-50 cursor-not-allowed'
                  : ''
              }
              text-white shadow-lg
            `}
          >
            {isConnecting ? (
              <svg
                className="animate-spin w-8 h-8"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            ) : isRecording ? (
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                <rect x="6" y="6" width="8" height="8" rx="1" />
              </svg>
            ) : (
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
              </svg>
            )}
          </button>
        </div>

        {isConnecting && (
          <p className="text-center text-blue-600 font-medium">
            Connecting to OpenAI Realtime API via WebRTC...
          </p>
        )}
        {isRecording && !isConnecting && (
          <p className="text-center text-red-600 font-medium animate-pulse">
            Recording... Speak now
          </p>
        )}
      </div>

      <div className="mb-4">
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Your voice transcript will appear here in real-time, or type manually..."
          className="w-full h-32 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          disabled={isProcessing}
        />
        {transcript && (
          <p className="text-xs text-gray-500 mt-1">
            {transcript.split(' ').length} words
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={!transcript.trim() || disabled || isProcessing}
          className={`
            flex-1 px-4 py-2 rounded-lg font-medium
            transition-colors
            ${
              transcript.trim() && !disabled && !isProcessing
                ? 'bg-primary-600 hover:bg-primary-700 text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }
          `}
        >
          {isProcessing ? 'Saving...' : 'Save Entry'}
        </button>

        {transcript && (
          <button
            onClick={() => {
              setTranscript('')
              accumulatedTranscriptRef.current = ''
            }}
            disabled={disabled || isProcessing}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
