# JobDiary Frontend

Voice-powered frontend for the JobDiary API, built with Next.js and Web Speech API.

## Features

- 🎤 **Voice-first interface** - Record voice entries using browser speech recognition
- 📝 **Job management** - View and manage multiple jobs
- 📋 **Entry history** - Browse all voice diary entries
- 🔍 **Smart extraction** - Automatically extracts tasks, next actions, and materials from voice
- 📱 **Responsive design** - Works on desktop and mobile

## Tech Stack

- **Next.js 14** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Web Speech API** - Voice recognition
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
NEXT_PUBLIC_API_KEY=your-api-key-here
```

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

Voice recording requires a browser with Web Speech API support:
- ✅ Chrome/Edge (best support)
- ✅ Safari (iOS 14.5+)
- ❌ Firefox (not supported)

## Usage

1. **Start recording** - Click the microphone button
2. **Speak your entry** - Describe your work, tasks completed, next steps
3. **Stop recording** - Click the button again
4. **Review transcript** - Edit if needed
5. **Save entry** - Automatically creates/updates job and saves entry

The system will:
- Extract job names from voice input
- Create new jobs automatically
- Extract structured data (tasks, materials, next actions)
- Save everything to the JobDiary API

