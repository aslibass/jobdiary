# Troubleshooting: "You didn't provide an API key" Error

## Problem

You're seeing this error when trying to record:
```
Failed to create call: { "error": { "message": "You didn't provide an API key..." } }
```

## Root Cause

This error occurs when the **OpenAI API key is not configured** on your server. The frontend needs to get an ephemeral token from your server, but the server can't create it without a valid OpenAI API key.

## Solution

### Step 1: Verify Environment Variable

Make sure `OPENAI_API_KEY` is set in your deployment environment (Railway, Vercel, etc.).

#### For Railway:

1. Go to your Railway project dashboard
2. Select your **frontend service**
3. Click on **"Variables"** tab
4. Check if `OPENAI_API_KEY` exists
5. If not, click **"New Variable"** and add:
   - **Name**: `OPENAI_API_KEY`
   - **Value**: Your OpenAI API key (starts with `sk-...`)

#### For Vercel:

1. Go to your Vercel project dashboard
2. Click on **"Settings"** → **"Environment Variables"**
3. Check if `OPENAI_API_KEY` exists
4. If not, add it:
   - **Key**: `OPENAI_API_KEY`
   - **Value**: Your OpenAI API key
   - **Environment**: Production, Preview, Development (select all)

#### For Local Development:

Create a `.env.local` file in the `frontend/` directory:

```bash
OPENAI_API_KEY=sk-your-actual-api-key-here
```

**Important**: Never commit `.env.local` to git - it's already in `.gitignore`.

### Step 2: Get Your OpenAI API Key

If you don't have an API key:

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign in or create an account
3. Navigate to **API Keys** section
4. Click **"Create new secret key"**
5. Copy the key (it starts with `sk-...`)
6. **Save it immediately** - you won't be able to see it again!

### Step 3: Verify the Key Works

Test that your API key is valid:

```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

If you get a list of models, your key is valid. If you get an error, the key is invalid or expired.

### Step 4: Restart Your Service

After adding the environment variable:

- **Railway**: The service will automatically redeploy
- **Vercel**: Trigger a new deployment
- **Local**: Restart your dev server (`npm run dev`)

### Step 5: Check Server Logs

Check your server logs to see if the API key is being read:

- **Railway**: View logs in the dashboard
- **Vercel**: Check function logs
- **Local**: Check terminal output

Look for:
- ✅ `Successfully extracted client_secret` - Key is working
- ❌ `OpenAI API key not configured` - Key is missing
- ❌ `401 Unauthorized` - Key is invalid

## Common Issues

### Issue 1: Key Not Set in Correct Service

**Problem**: You set the key in the backend service, but the frontend needs it.

**Solution**: Make sure `OPENAI_API_KEY` is set in the **frontend service**, not just the backend.

### Issue 2: Key Has Wrong Name

**Problem**: The environment variable is named differently (e.g., `OPENAI_KEY` instead of `OPENAI_API_KEY`).

**Solution**: The variable **must** be named exactly `OPENAI_API_KEY`.

### Issue 3: Key is Invalid or Expired

**Problem**: The API key you're using is no longer valid.

**Solution**: 
1. Generate a new key from OpenAI Platform
2. Update the environment variable
3. Redeploy your service

### Issue 4: Key Has Insufficient Permissions

**Problem**: Your API key doesn't have access to the Realtime API.

**Solution**: 
1. Check your OpenAI account plan
2. Ensure you have access to the Realtime API
3. Some features may require a paid plan

## Verification

After fixing the issue, test the recording:

1. Open the app
2. Click the microphone button
3. You should see "Connecting..." then "Recording..."
4. If you still see the error, check the browser console (F12) for detailed error messages

## Still Having Issues?

1. **Check browser console** (F12 → Console tab) for detailed error messages
2. **Check server logs** for API key validation errors
3. **Verify the key format**: Should start with `sk-` and be about 50+ characters
4. **Test the key directly**: Use curl or Postman to verify it works
5. **Contact support** with:
   - Error message from browser console
   - Server logs showing the issue
   - Confirmation that `OPENAI_API_KEY` is set

## Security Note

⚠️ **Never expose your API key**:
- Don't commit it to git
- Don't put it in client-side code
- Don't share it publicly
- The current implementation keeps it server-side only (secure ✅)

