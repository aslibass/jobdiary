'use client'

import { useState, useEffect, useRef } from 'react'

interface VoiceRecorderProps {
  onSubmit: (transcript: string, extracted?: any) => void
  disabled?: boolean
  onToast?: (message: string, type?: 'success' | 'error' | 'info') => void
  onCommand?: (cmd: VoiceCommand) => void | Promise<void>
}

type ChatRole = 'user' | 'assistant' | 'system'
type ChatMessage = {
  id: string
  role: ChatRole
  text: string
  ts: number
}

type VoiceCommand =
  | { type: 'list_jobs' }
  | { type: 'create_job'; name: string }
  | { type: 'select_job'; query: string }
  | { type: 'mark_job_status'; status: 'quoted' | 'in_progress' | 'complete' | 'on_hold' }
  | { type: 'search_entries'; query: string }
  | { type: 'show_entries' }
  | { type: 'set_job_stage'; stage: string }
  | { type: 'save_entry' }
  | { type: 'save_debrief'; transcript: string }

export default function VoiceRecorder({ onSubmit, disabled, onToast, onCommand }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  // Draft that will be saved to JobDiary (separate from assistant messages)
  const [transcript, setTranscript] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [audioLevel, setAudioLevel] = useState(0)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const accumulatedTranscriptRef = useRef<string>('') // draft buffer
  const ephemeralTokenRef = useRef<string | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const recordingStartTimeRef = useRef<number | null>(null)
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)
  const assistantStreamingRef = useRef<boolean>(false)

  const appendMessage = (role: ChatRole, text: string) => {
    const id = `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    setMessages((prev) => [...prev, { id, role, text, ts: Date.now() }])
  }

  const appendAssistantDelta = (delta: string) => {
    setMessages((prev) => {
      if (prev.length === 0) {
        return [{ id: `assistant-${Date.now()}`, role: 'assistant', text: delta, ts: Date.now() }]
      }
      const last = prev[prev.length - 1]
      if (last.role === 'assistant' && assistantStreamingRef.current) {
        const updated = { ...last, text: last.text + delta }
        return [...prev.slice(0, -1), updated]
      }
      assistantStreamingRef.current = true
      return [...prev, { id: `assistant-${Date.now()}`, role: 'assistant', text: delta, ts: Date.now() }]
    })
  }

  const finalizeAssistant = (finalText?: string) => {
    assistantStreamingRef.current = false
    if (!finalText) return
    setMessages((prev) => {
      if (prev.length === 0) return [{ id: `assistant-${Date.now()}`, role: 'assistant', text: finalText, ts: Date.now() }]
      const last = prev[prev.length - 1]
      if (last.role === 'assistant') {
        return [...prev.slice(0, -1), { ...last, text: finalText }]
      }
      return [...prev, { id: `assistant-${Date.now()}`, role: 'assistant', text: finalText, ts: Date.now() }]
    })
  }

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

  const isSaveCommand = (text: string) => {
    return /\b(save it|save this|save entry|save now|save that)\b/i.test(text)
  }

  const parseVoiceCommand = (text: string): VoiceCommand | null => {
    const t = text.trim()

    if (/\b(list jobs|show jobs|what jobs)\b/i.test(t)) return { type: 'list_jobs' }

    // create job
    // examples: "new job kitchen repaint", "create job called Smith house"
    {
      const m = t.match(/\b(?:new|create|start)\s+job(?:\s+(?:called|named))?\s+(.+?)\s*$/i)
      if (m?.[1]) return { type: 'create_job', name: m[1].trim() }
    }

    // select/switch job
    {
      const m = t.match(/\b(?:switch|select|open)\s+(?:to\s+)?job\s+(.+?)\s*$/i)
      if (m?.[1]) return { type: 'select_job', query: m[1].trim() }
    }

    // mark status
    if (/\b(mark|set)\s+(?:this\s+)?job\s+(?:as\s+)?complete\b/i.test(t) || /\b(job\s+done|finished\s+job)\b/i.test(t)) {
      return { type: 'mark_job_status', status: 'complete' }
    }
    if (/\b(mark|set)\s+(?:this\s+)?job\s+(?:as\s+)?in\s+progress\b/i.test(t)) {
      return { type: 'mark_job_status', status: 'in_progress' }
    }
    if (/\b(mark|set)\s+(?:this\s+)?job\s+(?:as\s+)?on\s+hold\b/i.test(t)) {
      return { type: 'mark_job_status', status: 'on_hold' }
    }
    if (/\b(mark|set)\s+(?:this\s+)?job\s+(?:as\s+)?quoted\b/i.test(t)) {
      return { type: 'mark_job_status', status: 'quoted' }
    }

    // search entries
    {
      const m = t.match(/\b(?:search|find)\s+(?:entries?|notes?)\s+(?:for|about)\s+(.+?)\s*$/i)
      if (m?.[1]) return { type: 'search_entries', query: m[1].trim() }
    }
    if (/\b(show|list)\s+(?:all\s+)?entries\b/i.test(t) || /\b(clear\s+search)\b/i.test(t)) {
      return { type: 'show_entries' }
    }

    // set stage (job_state patch)
    {
      const m = t.match(/\b(?:set|update)\s+(?:job\s+)?stage\s+(?:to\s+)?(.+?)\s*$/i)
      if (m?.[1]) return { type: 'set_job_stage', stage: m[1].trim() }
    }

    // save variants
    if (/\b(save debrief|debrief save|save as debrief)\b/i.test(t)) {
      const draft = accumulatedTranscriptRef.current.trim()
      return { type: 'save_debrief', transcript: draft }
    }
    if (isSaveCommand(t)) return { type: 'save_entry' }

    return null
  }

  const startRecording = async () => {
    if (isRecording || disabled) return

    setError(null)
    setIsConnecting(true)
    accumulatedTranscriptRef.current = ''
    assistantStreamingRef.current = false
    setMessages([])
    appendMessage('system', "Say your update naturally. When you're ready, say “save it” to save to the job.")

    try {
      // Step 1: Get ephemeral token from our server
      const tokenResponse = await fetch('/api/realtime-token', {
        method: 'POST',
      })

      if (!tokenResponse.ok) {
        const error = await tokenResponse.json()
        console.error('Token request failed:', error)
        throw new Error(error.error || error.details || 'Failed to get ephemeral token')
      }

      const tokenData = await tokenResponse.json()
      console.log('Token response received:', { 
        hasClientSecret: !!tokenData.client_secret,
        clientSecretType: typeof tokenData.client_secret,
        clientSecretValue: tokenData.client_secret
      })
      
      // Server returns: { client_secret: "..." }
      const clientSecret = tokenData.client_secret
      
      if (!clientSecret) {
        console.error('No client_secret in response:', tokenData)
        throw new Error('Failed to get ephemeral token: missing client_secret')
      }
      
      if (typeof clientSecret !== 'string') {
        console.error('Invalid client_secret type in response:', {
          type: typeof clientSecret,
          value: clientSecret,
          fullResponse: tokenData
        })
        throw new Error(`Failed to get ephemeral token: client_secret is ${typeof clientSecret}, expected string`)
      }
      
      ephemeralTokenRef.current = clientSecret
      if (tokenData.session_id) {
        sessionIdRef.current = tokenData.session_id
        console.log('Session ID received:', tokenData.session_id)
      }
      console.log('Ephemeral token received and stored (length:', clientSecret.length, ')')

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

      // Play assistant audio back to user (speech-to-speech)
      pc.ontrack = (e) => {
        const stream = e.streams?.[0]
        if (stream && audioPlayerRef.current) {
          audioPlayerRef.current.srcObject = stream
          // Autoplay may be blocked until user gesture; best effort.
          audioPlayerRef.current.play().catch(() => {})
        }
      }

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

          // Handle transcription / text events
          if (data.type === 'conversation.item.input_audio_transcription.completed') {
            const newText = data.transcript
            if (newText) {
              // Add to visible conversation as USER
              appendMessage('user', newText)

              // Voice commands (mapped to JobDiary API)
              const cmd = parseVoiceCommand(newText)
              if (cmd) {
                // Don't pollute the draft with command phrases
                if (cmd.type === 'save_entry') {
                  onToast?.('Saving entry…', 'info')
                  if (accumulatedTranscriptRef.current.trim()) {
                    handleSubmit()
                  } else {
                    onToast?.('Nothing to save yet. Say your update first.', 'error')
                  }
                } else if (cmd.type === 'save_debrief') {
                  if (!cmd.transcript) {
                    onToast?.('Nothing to debrief yet. Say your update first.', 'error')
                  } else {
                    onToast?.('Saving debrief…', 'info')
                    Promise.resolve(onCommand?.(cmd)).catch((e) => {
                      console.error('Command failed:', e)
                      onToast?.(e?.message || 'Command failed', 'error')
                    })
                  }
                } else {
                  Promise.resolve(onCommand?.(cmd)).catch((e) => {
                    console.error('Command failed:', e)
                    onToast?.(e?.message || 'Command failed', 'error')
                  })
                }
                return
              }

              // Otherwise accumulate into the draft-to-save
              accumulatedTranscriptRef.current += newText + ' '
              setTranscript(accumulatedTranscriptRef.current.trim())
            }
          } else if (data.type === 'response.text.delta') {
            // Assistant text stream (we show it in the conversation)
            const delta = data.delta
            if (delta) {
              appendAssistantDelta(delta)
            }
          } else if (data.type === 'response.text.done') {
            finalizeAssistant(data.text)
          } else if (data.type === 'response.audio_transcript.delta') {
            // Some implementations emit assistant transcript here; show it as assistant text
            const delta = data.delta
            if (delta) appendAssistantDelta(delta)
          } else if (data.type === 'response.audio_transcript.done') {
            finalizeAssistant(data.transcript)
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
        // Enable two-way conversation:
        // - modalities: audio + text (assistant can speak back and also send text)
        // - whisper-1 transcription for user input
        dataChannel.send(JSON.stringify({
          type: 'session.update',
          session: {
            model: 'gpt-realtime-mini', // Use gpt-realtime-mini for cost efficiency
            modalities: ['text', 'audio'],
            instructions:
              "You are JobDiary, a voice assistant for tradies. Have a natural conversation to collect the user's end-of-day job update. Ask short, practical follow-up questions one at a time. Keep it concise. When the user says 'save it' (or similar), stop asking questions and respond with a brief confirmation like 'Saving it now.' Do not mention tools or APIs.",
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
      // Based on official pattern: create offer, set local description, send immediately
      // Don't wait for ICE gathering - OpenAI will handle it
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      })
      await pc.setLocalDescription(offer)
      
      // Note: We don't wait for ICE gathering here
      // The SDP will be updated automatically as ICE candidates are gathered
      // OpenAI's endpoint can handle incomplete SDP offers

      // Step 6: Send SDP offer to OpenAI Realtime API
      if (!ephemeralTokenRef.current) {
        throw new Error('Ephemeral token is missing. Please try again.')
      }
      
      if (!offer.sdp) {
        throw new Error('SDP offer is missing')
      }
      
      console.log('Creating WebRTC call with ephemeral token...')
      console.log('SDP offer length:', offer.sdp.length)
      console.log('SDP offer first line:', offer.sdp.split('\n')[0])
      console.log('ICE gathering state:', pc.iceGatheringState)
      console.log('Using token:', ephemeralTokenRef.current.substring(0, 10) + '...')
      
      // OpenAI Realtime API WebRTC call creation
      // The endpoint expects the SDP offer in the body with Content-Type: application/sdp
      // Based on official pattern: send SDP immediately after setting local description
      const primaryCallUrl = 'https://api.openai.com/v1/realtime/calls'
      const fallbackCallUrl = 'https://api.openai.com/v1/realtime'

      let sdpResponse = await fetch(primaryCallUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ephemeralTokenRef.current}`,
          'Content-Type': 'application/sdp',
          // Some Realtime endpoints require the beta header; harmless if not required.
          'OpenAI-Beta': 'realtime=v1',
        },
        body: offer.sdp,
      })

      // Some environments / versions may use a different endpoint; retry once on 400.
      if (!sdpResponse.ok && sdpResponse.status === 400) {
        console.warn('Call creation returned 400; retrying with fallback endpoint:', fallbackCallUrl)
        sdpResponse = await fetch(fallbackCallUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${ephemeralTokenRef.current}`,
            'Content-Type': 'application/sdp',
            'OpenAI-Beta': 'realtime=v1',
          },
          body: offer.sdp,
        })
      }

      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text()
        let errorData
        try {
          errorData = JSON.parse(errorText)
        } catch {
          errorData = { message: errorText }
        }
        console.error('Failed to create call:', {
          status: sdpResponse.status,
          statusText: sdpResponse.statusText,
          headers: Object.fromEntries(sdpResponse.headers.entries()),
          error: errorData,
          errorText: errorText
        })
        throw new Error(`Failed to create call (${sdpResponse.status}): ${errorData.error?.message || errorData.message || errorText}`)
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
      appendMessage('assistant', 'Saved. Want to add anything else?')
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
        Voice Conversation
      </h2>

      {/* Assistant audio playback (speech-to-speech) */}
      <audio ref={audioPlayerRef} autoPlay playsInline className="hidden" />

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

      {/* Conversation transcript */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Conversation</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Tip: say “save it” to save</p>
        </div>
        <div className="h-44 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3 space-y-2">
          {messages.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Press the mic and talk like you normally would. The assistant will ask quick follow-ups.
            </p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className="text-sm">
                <span
                  className={
                    m.role === 'user'
                      ? 'font-semibold text-gray-900 dark:text-white'
                      : m.role === 'assistant'
                      ? 'font-semibold text-primary-700 dark:text-primary-300'
                      : 'font-semibold text-gray-600 dark:text-gray-400'
                  }
                >
                  {m.role === 'user' ? 'You' : m.role === 'assistant' ? 'JobDiary' : 'System'}:{' '}
                </span>
                <span className="text-gray-800 dark:text-gray-200">{m.text}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Draft to save</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            This is what will be saved to the selected job.
          </p>
        </div>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Your job notes build up here as you talk. You can also type edits. Say “save it” to save."
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
