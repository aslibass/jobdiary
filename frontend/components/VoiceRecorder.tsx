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
  
  const socketRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const accumulatedTranscriptRef = useRef<string>('')

  useEffect(() => {
    return () => {
      stopRecording()
    }
  }, [])

  const startRecording = async () => {
    if (isRecording || disabled) return

    const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY
    if (!apiKey) {
      setError('OpenAI API key not configured. Set NEXT_PUBLIC_OPENAI_API_KEY')
      return
    }

    setError(null)
    setIsConnecting(true)
    accumulatedTranscriptRef.current = ''

    try {
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

      // Create audio context for processing (24kHz for OpenAI Realtime API)
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 })
      audioContextRef.current = audioContext

      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      // Connect WebSocket to OpenAI Realtime API
      const model = 'gpt-4o-realtime-preview-2024-12-17'
      const wsUrl = `wss://api.openai.com/v1/realtime?model=${model}&api_key=${apiKey}`
      const ws = new WebSocket(wsUrl)

      socketRef.current = ws

      ws.onopen = () => {
        setIsConnecting(false)
        setIsRecording(true)
        setTranscript('')
        
        // Configure the session
        ws.send(JSON.stringify({
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

        // Start sending audio
        ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))

        // Process audio and send to OpenAI
        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return

          const inputData = e.inputBuffer.getChannelData(0)
          const pcm16 = new Int16Array(inputData.length)
          
          // Convert float32 (-1 to 1) to int16 (-32768 to 32767)
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]))
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
          }

          // Convert to base64 for transmission
          const base64Audio = btoa(
            String.fromCharCode.apply(null, Array.from(pcm16))
          )

          // Send audio chunk
          ws.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: base64Audio,
          }))
        }

        source.connect(processor)
        processor.connect(audioContext.destination)
      }

      ws.onmessage = (event) => {
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
            // Partial transcript updates
            const delta = data.delta
            if (delta) {
              accumulatedTranscriptRef.current += delta
              setTranscript(accumulatedTranscriptRef.current.trim())
            }
          } else if (data.type === 'response.audio_transcript.done') {
            // Final transcript
            const final = data.transcript
            if (final) {
              accumulatedTranscriptRef.current = final
              setTranscript(final)
            }
          } else if (data.type === 'error') {
            console.error('OpenAI Realtime API error:', data)
            setError(data.error?.message || 'An error occurred with transcription')
            stopRecording()
          } else if (data.type === 'session.updated') {
            // Session configured successfully
            console.log('Session updated:', data)
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err)
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        setError('Connection error. Please check your API key and try again.')
        stopRecording()
      }

      ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason)
        setIsRecording(false)
        setIsConnecting(false)
        
        if (event.code !== 1000) {
          setError('Connection closed unexpectedly. Please try again.')
        }
      }

    } catch (err: any) {
      console.error('Failed to start recording:', err)
      setError(err.message || 'Failed to start recording. Please check microphone permissions.')
      setIsConnecting(false)
      stopRecording()
    }
  }

  const stopRecording = () => {
    // Commit final audio buffer
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
      
      // Wait a bit for final transcription, then close
      setTimeout(() => {
        if (socketRef.current) {
          socketRef.current.close(1000, 'Recording stopped')
          socketRef.current = null
        }
      }, 1000)
    }

    // Stop audio processing
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
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
