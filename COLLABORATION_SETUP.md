# Collaborative Editing Setup Guide

## Overview

Your ProseMirror speech editor now supports real-time collaborative editing using Yjs CRDT technology. Multiple users can work on the same document simultaneously, with automatic conflict resolution and real-time synchronization.

## Features Implemented

### ✅ Session Management
- **6-character session codes** (e.g., `A3F9K2`) for easy sharing
- **Full WebSocket URLs** for direct connection
- **QR codes** for mobile device joining
- Room-based isolation (each session is completely separate)

### ✅ Real-time Synchronization
- **Document changes** sync instantly across all participants
- **Word confirmations** sync via Yjs (first to confirm wins)
- **Cursor positions** visible to all participants
- **Auto-confirm settings** controlled by host

### ✅ Permission System
- **Host** (session creator):
  - Can use ASR/recording
  - Controls auto-confirm settings
  - Can share session
  - Full editing rights

- **Guest** (session joiner):
  - Cannot use ASR/recording (disabled)
  - Can manually edit text
  - Can confirm words (competes with host)
  - Full editing rights (except recording)

### ✅ Conflict Resolution
- **First-to-confirm-wins** for word approvals
- **Automatic CRDT merging** for document edits
- **Timestamps** track who confirmed what

## Setup Instructions

### 1. Configure Yjs Server URL

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# For local development
VITE_YJS_SERVER_URL=ws://localhost:1234

# For production (after deploying yjs-server)
# VITE_YJS_SERVER_URL=wss://your-yjs-server.com
```

### 2. Start the Yjs Server

#### Local Development:

```bash
cd yjs-server
npm start
```

The server will start on `ws://localhost:1234`.

#### Production Deployment:

See `yjs-server/DEPLOYMENT.md` for detailed deployment instructions for:
- Railway
- Render
- Fly.io
- Docker

### 3. Start the Application

```bash
npm run dev
```

## How to Use

### Starting a New Collaborative Session (Host)

1. Open the application
2. Click **"Start New Session"** button
3. A session code will be generated (e.g., `A3F9K2`)
4. Click the **"Share"** button to view:
   - Session code (copy to clipboard)
   - Full URL (copy to clipboard)
   - QR code (scan with mobile device)
5. Share the code/URL/QR with collaborators
6. Start recording and editing normally

### Joining an Existing Session (Guest)

#### Option 1: Via Session Code
1. Open the application
2. Enter the 6-character code in the "Join Session" field
3. Click **"Join"** or press Enter
4. You'll be connected as a guest

#### Option 2: Via URL
1. Click the shared link (e.g., `https://your-app.com?join=A3F9K2`)
2. The app will automatically join the session

#### Option 3: Via QR Code
1. Scan the QR code with your mobile device
2. The app will open and automatically join

## Collaborative Features

### Word Confirmation Competition

When multiple users try to confirm the same word:
- **First person to press Enter wins**
- The word is immediately marked as approved for everyone
- Other participants see the word as already confirmed
- Losers automatically move to the next unapproved word

### Live Editing

All participants can:
- See real-time document changes
- View each other's cursor positions (color-coded)
- Edit text simultaneously
- Undo/redo their own changes (via Yjs undo manager)

### Auto-Confirm (Host Only)

The host controls auto-confirmation:
- Guests see the auto-confirm status
- Only host can enable/disable auto-confirm
- Auto-confirm times are synced to all participants

## Technical Architecture

### File Structure

```
src/lib/collaboration/
├── CollaborationManager.ts    # Main Yjs integration class
├── sessionCode.ts              # Session code generation/validation
└── types.ts                    # TypeScript types

src/lib/components/prosemirror-speech/
├── ShareSessionModal.svelte    # Share UI (code, URL, QR)
├── SessionStatus.svelte        # Connection status indicator
└── SpeechEditor.svelte         # Updated with collaboration support

yjs-server/
├── server.js                   # WebSocket server with room management
├── Dockerfile                  # Docker deployment config
└── DEPLOYMENT.md               # Deployment instructions
```

### Data Synchronization

1. **ProseMirror Document**: Synced via `y-prosemirror` binding
2. **Word Approvals**: Stored in `Y.Map<wordId, { approved, approvedBy, timestamp }>`
3. **Session Metadata**: Stored in `Y.Map` (host ID, auto-confirm settings)
4. **User Awareness**: Cursor positions, online status via `y-websocket` awareness

### Database Schema

Collaborative sessions are tracked in SQLite:

```sql
CREATE TABLE transcription_sessions (
    -- ... existing fields ...
    is_collaborative INTEGER DEFAULT 0,
    session_code TEXT,
    collaboration_role TEXT,  -- 'host' or 'guest'
    participants TEXT         -- JSON array of participant info
);
```

## Troubleshooting

### Server Connection Issues

**Problem**: "Connecting..." status never becomes "Connected"

**Solutions**:
1. Verify yjs-server is running: `curl http://localhost:1234/health`
2. Check VITE_YJS_SERVER_URL in `.env`
3. Check browser console for WebSocket errors
4. Ensure firewall allows WebSocket connections

### Session Join Failures

**Problem**: "Invalid session code" error

**Solutions**:
1. Verify code is exactly 6 characters (uppercase letters + numbers)
2. Check for typos (exclude ambiguous: 0, O, 1, I, L)
3. Ensure yjs-server is running

### Recording Disabled for Guest

**Problem**: Guest cannot press the record button

**Expected Behavior**: This is intentional! Only the host can record/use ASR.

**Workaround**: If guest needs to record, they should start their own session as host.

### Word Confirmation Conflicts

**Problem**: "Word already approved by another user" message

**Expected Behavior**: This means someone else confirmed the word first.

**Solution**: Move to the next word (automatic) and try again.

## Security Considerations

### Current Implementation

- **No authentication**: Anyone with a session code can join
- **Public sessions**: All sessions are visible on `/stats` endpoint
- **No encryption**: WebSocket traffic is unencrypted (use WSS in production)
- **No rate limiting**: Server accepts unlimited connections

### Recommended for Production

1. **Use WSS (WebSocket Secure)**: Deploy with HTTPS/WSS
2. **Add authentication**: Implement token-based session access
3. **Session expiry**: Auto-close sessions after inactivity
4. **Rate limiting**: Limit connections per IP
5. **CORS configuration**: Restrict origins via `ALLOWED_ORIGINS`

## Performance Tips

### Network Requirements

- **Minimum**: 100 kbps per participant (text-only)
- **Recommended**: 500 kbps+ for smooth experience
- **Latency**: <200ms for best responsiveness

### Optimization

1. **Deploy yjs-server close to users** (use CDN/edge deployment)
2. **Limit participants**: 2-5 users per session recommended
3. **Monitor server stats**: Visit `/stats` endpoint to track active sessions
4. **Use production builds**: `npm run build` for optimized client

## Next Steps

### Optional Enhancements

- [ ] Add user names/avatars
- [ ] Implement session passwords
- [ ] Add chat functionality
- [ ] Export collaborative session transcripts
- [ ] Add session recording/playback
- [ ] Implement admin controls (kick users, lock session)

### Deployment Checklist

- [ ] Deploy yjs-server to production (Railway/Render/Fly.io)
- [ ] Update `.env` with production WebSocket URL
- [ ] Configure CORS (`ALLOWED_ORIGINS` environment variable)
- [ ] Enable HTTPS/WSS
- [ ] Test with multiple devices
- [ ] Monitor server health (`/health` endpoint)

## Support

For issues or questions:
1. Check server logs: `cd yjs-server && npm start`
2. Check browser console for client-side errors
3. Visit `/stats` endpoint to see active sessions
4. Review `yjs-server/DEPLOYMENT.md` for deployment help

---

**🎉 Enjoy collaborative editing!**
