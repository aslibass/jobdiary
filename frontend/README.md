# JobDiary Frontend

Voice-powered frontend for the JobDiary API, built with Next.js and OpenAI Realtime API (WebRTC).

## Features

- 🎤 **Voice-first interface** - Record voice entries using OpenAI Realtime API with high-quality transcription
- 📝 **Job management** - View and manage multiple jobs
- 📋 **Entry history** - Browse all voice diary entries
- 🔍 **Smart extraction** - Automatically extracts tasks, next actions, and materials from voice
- 📱 **Responsive design** - Works on desktop and mobile
- 🎯 **Real-time transcription** - See your words appear as you speak

## Tech Stack

- **Next.js 14** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **OpenAI Realtime API** - High-quality voice transcription via WebRTC
- **Axios** - API client

## Setup

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
cd frontend
npm install
```

### Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_API_URL=https://jobdiaryapi-production.up.railway.app
NEXT_PUBLIC_API_KEY=your-jobdiary-api-key-here
NEXT_PUBLIC_OPENAI_API_KEY=your-openai-api-key-here
```

**Important:** You need an OpenAI API key with access to the Realtime API. The key must be exposed to the browser (via `NEXT_PUBLIC_` prefix), so be aware of usage costs.

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Build

```bash
npm run build
npm start
```

## Railway Deployment

The frontend can be deployed to Railway as a separate service:

1. **Connect your repository** to Railway
2. **Set root directory** to `frontend/`
3. **Add environment variables**:
   - `NEXT_PUBLIC_API_URL` - Your JobDiary API URL
   - `NEXT_PUBLIC_API_KEY` - Your API key
4. **Railway will auto-detect** Next.js and deploy

### Railway Configuration

Railway will automatically:
- Detect Next.js
- Run `npm install`
- Run `npm run build`
- Start with `npm start`

The `PORT` environment variable is automatically set by Railway.

## Browser Support

Voice recording uses OpenAI Realtime API via WebRTC:
- ✅ Chrome/Edge (best support)
- ✅ Safari (macOS/iOS)
- ✅ Firefox (with WebRTC support)
- Requires microphone permissions

## Usage

1. **Start recording** - Click the microphone button (connects to OpenAI Realtime API)
2. **Speak your entry** - Describe your work, tasks completed, next steps
3. **Watch real-time transcription** - See your words appear as you speak
4. **Stop recording** - Click the button again
5. **Review transcript** - Edit if needed
6. **Save entry** - Automatically creates/updates job and saves entry

The system will:
- Extract job names from voice input
- Create new jobs automatically
- Extract structured data (tasks, materials, next actions)
- Save everything to the JobDiary API

## OpenAI Realtime API

This frontend uses OpenAI's Realtime API for high-quality voice transcription. Key features:
- **Real-time streaming** - See transcription as you speak
- **High accuracy** - Better than browser Web Speech API
- **Server-side VAD** - Automatic voice activity detection
- **WebRTC connection** - Low-latency audio streaming

**Note:** The OpenAI API key is exposed to the browser. Monitor your usage and costs.

