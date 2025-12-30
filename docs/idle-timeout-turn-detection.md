# Idle Timeout and Turn Detection Configuration

This document explains how we handle idle timeouts and turn detection in the JobDiary voice interface using OpenAI's Realtime API.

## Turn Detection

We use **server-side voice activity detection (VAD)** to automatically detect when the user starts and stops speaking.

### Configuration

```typescript
turn_detection: {
  type: 'server_vad',              // Server-side voice activity detection
  threshold: 0.5,                  // Sensitivity of voice detection (0.0 to 1.0)
  prefix_padding_ms: 300,          // Audio to include before detected speech (ms)
  silence_duration_ms: 500,        // Duration of silence to trigger turn end (ms)
  idle_timeout_ms: 30000,          // Timeout after assistant response if no user input (30s)
}
```

### Parameters Explained

- **`type: 'server_vad'`**: Uses OpenAI's server-side voice activity detection, which analyzes audio volume to detect speech boundaries.

- **`threshold: 0.5`**: Sensitivity of voice detection (0.0 to 1.0). 
  - Lower values = more sensitive (detects quieter speech)
  - Higher values = less sensitive (requires louder speech)
  - Default: 0.5 (balanced)

- **`prefix_padding_ms: 300`**: Amount of audio (in milliseconds) to include before the detected speech start. This ensures we capture the beginning of words that might have been cut off.

- **`silence_duration_ms: 500`**: Duration of silence (in milliseconds) that indicates the user has finished speaking. After 500ms of silence, the system considers the turn complete and processes the transcription.

- **`idle_timeout_ms: 30000`**: Timeout period (30 seconds) after the assistant's last response. If no user input is detected within this time, the system triggers an `input_audio_buffer.timeout_triggered` event.

## Idle Timeout Handling

### How It Works

1. **After Assistant Response**: When the assistant finishes responding (or if there's no assistant response), the idle timeout starts counting.

2. **No User Input**: If the user doesn't speak for `idle_timeout_ms` (30 seconds), the system triggers an idle timeout.

3. **Timeout Event**: The system emits `input_audio_buffer.timeout_triggered`, which:
   - Commits an empty audio segment to the conversation history
   - Prompts the model to respond (useful for conversational agents)
   - In our transcription-only mode, we log this event

### Event Handling

```typescript
else if (data.type === 'input_audio_buffer.timeout_triggered') {
  // Idle timeout triggered - user hasn't spoken for idle_timeout_ms
  console.log('Idle timeout triggered - no user input detected')
  
  // If we have a transcript, we could auto-submit or show a prompt
  if (accumulatedTranscriptRef.current.trim()) {
    console.log('Transcript available on idle timeout:', accumulatedTranscriptRef.current)
  }
}
```

### Current Behavior

- **Logs the timeout**: We log when an idle timeout occurs for debugging
- **Preserves transcript**: If there's accumulated transcript text, it's preserved
- **No auto-submit**: Currently, we don't auto-submit on timeout (user must click submit)

### Future Enhancements

Potential improvements:
- Auto-submit transcript if it exists when timeout occurs
- Show a visual indicator that the connection is still active
- Prompt the user to continue speaking
- Automatically stop recording after extended idle period

## Turn Detection Flow

1. **User starts speaking**: Server VAD detects audio above threshold
2. **Speech continues**: Audio is buffered and processed
3. **User stops speaking**: After `silence_duration_ms` (500ms) of silence, turn is complete
4. **Transcription**: Audio is transcribed using Whisper-1
5. **Event emitted**: `conversation.item.input_audio_transcription.completed` with transcript
6. **UI updates**: Transcript is displayed to the user

## Best Practices

### Turn Detection Tuning

- **For quiet environments**: Lower `threshold` (e.g., 0.3-0.4)
- **For noisy environments**: Higher `threshold` (e.g., 0.6-0.7)
- **For fast speakers**: Lower `silence_duration_ms` (e.g., 300ms)
- **For slow speakers**: Higher `silence_duration_ms` (e.g., 700-1000ms)

### Idle Timeout Tuning

- **For quick interactions**: Lower `idle_timeout_ms` (e.g., 15000ms = 15 seconds)
- **For longer pauses**: Higher `idle_timeout_ms` (e.g., 60000ms = 60 seconds)
- **For transcription-only**: Higher timeout is fine (we're not waiting for assistant response)

## References

- [OpenAI Realtime API Documentation](https://platform.openai.com/docs/guides/realtime)
- [OpenAI Realtime API Blog Post](https://developers.openai.com/blog/realtime-api)
- [OpenAI Agents Python Reference](https://openai.github.io/openai-agents-python/ref/realtime/config/)

