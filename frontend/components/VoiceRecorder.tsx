'use client'

import { useState, useEffect, useRef } from 'react'
import OpenAI from 'openai'

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
  
  const socketRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const accumulatedTranscriptRef = useRef<string>('')

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      stopRecording()
    }
  }, [])

  const getOpenAIClient = () => {
    const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OpenAI API key not configured. Set NEXT_PUBLIC_OPENAI_API_KEY')
    }
    return new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
  }

  const startRecording = async () => {
    if (isRecording || disabled) return

    setError(null)
    setIsConnecting(true)
    accumulatedTranscriptRef.current = ''

    try {
      const openai = getOpenAIClient()

      // Create Realtime API session
      const response = await fetch('https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          voice: 'alloy',
          instructions: 'You are a helpful assistant for a job diary app. Transcribe the user\'s voice accurately. When the user finishes speaking, provide a clear transcript.',
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
          },
          modalities: ['text', 'audio'],
          temperature: 0.8,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to create session' }))
        throw new Error(errorData.error?.message || 'Failed to connect to OpenAI Realtime API')
      }

      const sessionData = await response.json()
      sessionIdRef.current = sessionData.id

      // Get user's microphone
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 24000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      })
      mediaStreamRef.current = stream

      // Create audio context for processing
      const audioContext = new AudioContext({ sampleRate: 24000 })
      audioContextRef.current = audioContext

      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)

      processor.onaudioprocess = async (e) => {
        if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return

        const inputData = e.inputBuffer.getChannelData(0)
        const pcm16 = new Int16Array(inputData.length)
        
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]))
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
        }

        // Send audio to OpenAI via WebSocket
        const audioMessage = {
          type: 'input_audio_buffer.append',
          audio: Array.from(pcm16).map(s => s.toString(36)).join(''),
        }

        socketRef.current.send(JSON.stringify(audioMessage))
      }

      source.connect(processor)
      processor.connect(audioContext.destination)

      // Connect WebSocket for real-time communication
      const wsUrl = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17`
      const ws = new WebSocket(wsUrl, [], {
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`,
        },
      } as any)

      socketRef.current = ws

      ws.onopen = () => {
        setIsConnecting(false)
        setIsRecording(true)
        setTranscript('')
        
        // Start the session
        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: 'Transcribe the user\'s voice accurately for a job diary entry.',
            voice: 'alloy',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
          },
        }))

        // Request input audio start
        ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
      }

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)

        if (data.type === 'conversation.item.input_audio_transcription.completed') {
          const newText = data.transcript
          accumulatedTranscriptRef.current += newText + ' '
          setTranscript(accumulatedTranscriptRef.current.trim())
        } else if (data.type === 'response.audio_transcript.delta') {
          // Handle partial transcripts
          const delta = data.delta
          accumulatedTranscriptRef.current += delta
          setTranscript(accumulatedTranscriptRef.current.trim())
        } else if (data.type === 'response.audio_transcript.done') {
          // Final transcript
          const final = data.transcript
          accumulatedTranscriptRef.current = final
          setTranscript(final)
        } else if (data.type === 'error') {
          setError(data.error?.message || 'An error occurred')
          stopRecording()
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        setError('Connection error. Please try again.')
        stopRecording()
      }

      ws.onclose = () => {
        setIsRecording(false)
        setIsConnecting(false)
      }

    } catch (err: any) {
      console.error('Failed to start recording:', err)
      setError(err.message || 'Failed to start recording. Please check your OpenAI API key.')
      setIsConnecting(false)
      stopRecording()
    }
  }

  const stopRecording = () => {
    if (socketRef.current) {
      // Request final transcript
      socketRef.current.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
      
      setTimeout(() => {
        socketRef.current?.close()
        socketRef.current = null
      }, 500)
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(console.error)
      audioContextRef.current = null
    }

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
    taskPatterns.forEach(pattern => {
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
    nextPatterns.forEach(pattern => {
      const matches = text.matchAll(pattern)
      for (const match of matches) {
        nextActions.push(match[1].trim())
      }
    })
    if (nextActions.length > 0) {
      extracted.next_actions = nextActions
    }

    // Extract materials
    const materialPattern = /(?:need|ordered|used)\s+(?:the\s+)?([^.!?]+?)\s+(?:materials?|supplies?|parts?)/gi
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

  const apiKeyConfigured = !!process.env.NEXT_PUBLIC_OPENAI_API_KEY

  if (!apiKeyConfigured) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-yellow-800">
          OpenAI API key not configured. Please set NEXT_PUBLIC_OPENAI_API_KEY environment variable.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-xl font-semibold mb-4">Voice Diary Entry (OpenAI Realtime)</h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 text-sm">{error}</p>
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
              ${isRecording
                ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                : 'bg-primary-500 hover:bg-primary-600'
              }
              ${disabled || isProcessing || isConnecting ? 'opacity-50 cursor-not-allowed' : ''}
              text-white shadow-lg
            `}
          >
            {isConnecting ? (
              <svg className="animate-spin w-8 h-8" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
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
            Connecting to OpenAI Realtime API...
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
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={!transcript.trim() || disabled || isProcessing}
          className={`
            flex-1 px-4 py-2 rounded-lg font-medium
            transition-colors
            ${transcript.trim() && !disabled && !isProcessing
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
