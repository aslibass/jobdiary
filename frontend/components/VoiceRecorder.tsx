'use client'

import { useState, useEffect, useRef } from 'react'

interface VoiceRecorderProps {
  onSubmit: (transcript: string, extracted?: any) => void
  disabled?: boolean
  onToast?: (message: string, type?: 'success' | 'error' | 'info') => void
}

export default function VoiceRecorder({ onSubmit, disabled, onToast }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [audioLevel, setAudioLevel] = useState(0)
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const accumulatedTranscriptRef = useRef<string>('')
  const ephemeralTokenRef = useRef<string | null>(null)
  const recordingStartTimeRef = useRef<number | null>(null)
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  useEffect(() => {
    // Load draft from localStorage on mount
    const draft = localStorage.getItem('jobdiary_draft')
    if (draft) {
      try {
        const draftData = JSON.parse(draft)
        if (draftData.transcript) {
          setTranscript(draftData.transcript)
          accumulatedTranscriptRef.current = draftData.transcript
          if (draftData.timestamp && Date.now() - draftData.timestamp < 24 * 60 * 60 * 1000) {
            // Draft is less than 24 hours old
            onToast?.('Draft restored from previous session', 'info')
          }
        }
      } catch (e) {
        console.error('Failed to load draft:', e)
      }
    }

    return () => {
      stopRecording()
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [onToast])

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
          autoGainControl: true,
        },
      })
      mediaStreamRef.current = stream

      // Set up audio level monitoring (will start after recording begins)
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyserRef.current = analyser
      
      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)

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
          } else if (data.type === 'input_audio_buffer.timeout_triggered') {
            // Idle timeout triggered - user hasn't spoken for idle_timeout_ms
            // This commits an empty audio segment and prompts the model to respond
            console.log('Idle timeout triggered - no user input detected')
            // Optionally: show a message to the user or auto-submit if transcript exists
            if (accumulatedTranscriptRef.current.trim()) {
              // If we have a transcript, we could auto-submit or show a prompt
              console.log('Transcript available on idle timeout:', accumulatedTranscriptRef.current)
            }
          } else if (data.type === 'error') {
            console.error('OpenAI Realtime API error:', data)
            setError(data.error?.message || 'An error occurred with transcription')
            stopRecording()
          } else {
            // Log other events for debugging
            console.debug('Realtime API event:', data.type, data)
          }
        } catch (err) {
          console.error('Error parsing data channel message:', err)
        }
      }

      dataChannel.onopen = () => {
        console.log('Data channel opened')
        // Configure session via data channel
        // Using gpt-realtime-mini model with whisper-1 for transcription
        dataChannel.send(JSON.stringify({
          type: 'session.update',
          session: {
            model: 'gpt-realtime-mini', // Use gpt-realtime-mini for cost efficiency
            modalities: ['text'], // or ['text', 'audio'] for speech-to-speech
            instructions: 'You are a transcription assistant for a job diary app. Transcribe the user\'s speech accurately. Only provide the transcript, no commentary.',
            voice: 'alloy', // Options: alloy, echo, fable, onyx, nova, shimmer
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1', // Use whisper-1 for transcription
            },
            turn_detection: {
              type: 'server_vad', // Server-side voice activity detection
              threshold: 0.5, // Sensitivity of voice detection (0.0 to 1.0)
              prefix_padding_ms: 300, // Audio to include before detected speech
              silence_duration_ms: 500, // Duration of silence to trigger turn end
              idle_timeout_ms: 30000, // Timeout after assistant response if no user input (30 seconds)
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
      accumulatedTranscriptRef.current = ''
      recordingStartTimeRef.current = Date.now()
      setRecordingDuration(0)
      
      // Start duration timer
      durationIntervalRef.current = setInterval(() => {
        if (recordingStartTimeRef.current) {
          setRecordingDuration(Math.floor((Date.now() - recordingStartTimeRef.current) / 1000))
        }
      }, 1000)

    } catch (err: any) {
      console.error('Failed to start recording:', err)
      setError(err.message || 'Failed to start recording. Please check microphone permissions.')
      setIsConnecting(false)
      stopRecording()
    }
  }

  const stopRecording = () => {
    // Stop duration timer
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }
    
    // Stop audio level monitoring
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    
    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    analyserRef.current = null

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
    setRecordingDuration(0)
    setAudioLevel(0)
    recordingStartTimeRef.current = null
    
    // Save draft to localStorage
    if (transcript.trim()) {
      localStorage.setItem('jobdiary_draft', JSON.stringify({
        transcript: transcript,
        timestamp: Date.now(),
      }))
    }
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
      
      // Clear draft from localStorage on successful save
      localStorage.removeItem('jobdiary_draft')
      
      onToast?.('Entry saved successfully!', 'success')
    } catch (error) {
      console.error('Submit error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to save entry. Please try again.'
      setError(errorMessage)
      onToast?.(errorMessage, 'error')
    } finally {
      setIsProcessing(false)
    }
  }

  const extractStructuredData = (text: string): Record<string, any> => {
    const extracted: Record<string, any> = {}

    // PAINTER-SPECIFIC: Extract areas/rooms painted
    const areaPatterns = [
      /(?:painted|finished|completed)\s+(?:the\s+)?([^.!?]+?)\s+(?:walls?|ceiling|trim|room|area|kitchen|bedroom|bathroom|living room|exterior|interior)/gi,
      /(?:kitchen|bedroom|bathroom|living room|dining room|hallway|exterior|interior|trim|ceiling|walls?)\s+(?:walls?|ceiling|trim)?/gi,
    ]
    const areas: string[] = []
    areaPatterns.forEach((pattern) => {
      const matches = Array.from(text.matchAll(pattern))
      matches.forEach((match) => {
        const area = match[1] || match[0]
        if (area && !areas.includes(area.trim().toLowerCase())) {
          areas.push(area.trim())
        }
      })
    })
    if (areas.length > 0) {
      extracted.areas_painted = areas
    }

    // PAINTER-SPECIFIC: Extract colors and paint brands
    const colorPatterns = [
      /(?:used|painted with|applied)\s+([0-9.]+(?:\s+gallons?)?)?\s*(?:of\s+)?([A-Z][A-Za-z\s]+?)\s+(?:paint|color|eggshell|satin|semi-gloss|flat|gloss)/gi,
      /(?:color|paint)\s+(?:is|was|SW|BM|PPG)\s*([A-Z0-9\s-]+)/gi,
      /(?:Sherwin Williams|Behr|Benjamin Moore|PPG|Valspar)\s+([A-Z0-9\s-]+)/gi,
    ]
    const colors: string[] = []
    colorPatterns.forEach((pattern) => {
      const matches = Array.from(text.matchAll(pattern))
      matches.forEach((match) => {
        const color = match[2] || match[1] || match[0]
        if (color && !colors.includes(color.trim().toLowerCase())) {
          colors.push(color.trim())
        }
      })
    })
    if (colors.length > 0) {
      extracted.colors = colors
    }

    // PAINTER-SPECIFIC: Extract techniques
    const techniquePatterns = [
      /(?:cut in|cutting in|rolled|rolling|sprayed|spraying|brushed|brushing|primed|priming|sanded|sanding|taped|taping|patched|patching)/gi,
    ]
    const techniques: string[] = []
    techniquePatterns.forEach((pattern) => {
      const matches = Array.from(text.matchAll(pattern))
      matches.forEach((match) => {
        if (!techniques.includes(match[0].toLowerCase())) {
          techniques.push(match[0].toLowerCase())
        }
      })
    })
    if (techniques.length > 0) {
      extracted.techniques = techniques
    }

    // PAINTER-SPECIFIC: Extract materials with quantities
    const materialPatterns = [
      /(?:used|need|ordered)\s+([0-9.]+)\s+(?:gallons?|quarts?|liters?)\s+(?:of\s+)?([^.!?]+?)(?:\s+paint)?/gi,
      /([0-9]+)\s+(?:brushes?|rollers?|trays?|drop cloths?|tape)/gi,
    ]
    const materials: Record<string, string> = {}
    materialPatterns.forEach((pattern) => {
      const matches = Array.from(text.matchAll(pattern))
      matches.forEach((match) => {
        const quantity = match[1]
        const item = match[2] || match[0].replace(quantity, '').trim()
        if (quantity && item) {
          materials[item] = quantity
        }
      })
    })
    if (Object.keys(materials).length > 0) {
      extracted.materials = materials
    }

    // Extract tasks completed (generic + painter-specific)
    const taskPatterns = [
      /(?:completed|finished|done)\s+([^.!?]+)/gi,
      /(?:painted|primed|sanded|taped|cut in|rolled|sprayed)\s+([^.!?]+)/gi,
    ]
    const tasks: string[] = []
    taskPatterns.forEach((pattern) => {
      const matches = Array.from(text.matchAll(pattern))
      matches.forEach((match) => {
        tasks.push(match[1].trim())
      })
    })
    if (tasks.length > 0) {
      extracted.tasks_completed = tasks
    }

    // Extract next actions
    const nextPatterns = [
      /(?:need to|will|should|next)\s+([^.!?]+)/gi,
      /(?:tomorrow|next week|later)\s+([^.!?]+)/gi,
      /(?:touch up|finish|complete)\s+([^.!?]+)/gi,
    ]
    const nextActions: string[] = []
    nextPatterns.forEach((pattern) => {
      const matches = Array.from(text.matchAll(pattern))
      matches.forEach((match) => {
        nextActions.push(match[1].trim())
      })
    })
    if (nextActions.length > 0) {
      extracted.next_actions = nextActions
    }

    // PAINTER-SPECIFIC: Extract issues/problems
    const issuePatterns = [
      /(?:issue|problem|bleed through|peeling|cracking|touch up needed|repair needed)/gi,
      /(?:need to|must|should)\s+(?:fix|repair|touch up|prime|sand)\s+([^.!?]+)/gi,
    ]
    const issues: string[] = []
    issuePatterns.forEach((pattern) => {
      const matches = Array.from(text.matchAll(pattern))
      matches.forEach((match) => {
        const issue = match[1] || match[0]
        if (issue && !issues.includes(issue.trim().toLowerCase())) {
          issues.push(issue.trim())
        }
      })
    })
    if (issues.length > 0) {
      extracted.issues = issues
    }

    return extracted
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-200 dark:border-gray-700">
      <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
        Voice Diary Entry
      </h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-2 text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 underline"
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
              w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center
              transition-all duration-200 touch-manipulation
              ${
                isRecording
                  ? 'bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 animate-pulse'
                  : 'bg-primary-500 hover:bg-primary-600 dark:bg-primary-600 dark:hover:bg-primary-700'
              }
              ${
                disabled || isProcessing || isConnecting
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:scale-105 active:scale-95'
              }
              text-white shadow-lg dark:shadow-xl
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
              // Stop icon (square)
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                <rect x="6" y="6" width="8" height="8" rx="1" />
              </svg>
            ) : (
              // Microphone icon
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                <path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4z" />
                <path d="M5.5 9.643a.75.75 0 00-1.5 0V10c0 3.06 2.29 5.585 5.25 5.954V17.5h-1.5a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-1.5v-1.546A6.001 6.001 0 0016 10v-.357a.75.75 0 00-1.5 0V10a4.5 4.5 0 01-9 0v-.357z" />
              </svg>
            )}
          </button>
        </div>

        {isConnecting && (
          <p className="text-center text-blue-600 dark:text-blue-400 font-medium">
            Connecting to OpenAI Realtime API via WebRTC...
          </p>
        )}
        {isRecording && !isConnecting && (
          <p className="text-center text-red-600 dark:text-red-400 font-medium animate-pulse">
            Recording... Speak now
          </p>
        )}
      </div>

      <div className="mb-4">
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Your voice transcript will appear here in real-time, or type manually..."
          className="w-full h-32 p-3 border border-gray-300 dark:border-gray-600 rounded-lg resize-none 
                     bg-white dark:bg-gray-700 
                     text-gray-900 dark:text-gray-100
                     placeholder-gray-400 dark:placeholder-gray-500
                     focus:ring-2 focus:ring-primary-500 focus:border-transparent
                     disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isProcessing}
        />
        {transcript && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
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
                ? 'bg-primary-600 hover:bg-primary-700 dark:bg-primary-600 dark:hover:bg-primary-700 text-white shadow-md hover:shadow-lg'
                : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
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
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 
                       text-gray-700 dark:text-gray-200 rounded-lg font-medium transition-colors 
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
