# Web Viewer Setup Guide

## Overview

The Kirikaja web viewer allows users to join collaborative editing sessions through a web browser without installing the desktop application. This guide covers the complete setup and deployment process.

## Architecture

```
kirikaja/ (monorepo root)
├── src/lib/                          # Shared components & utilities
│   ├── components/prosemirror-speech/ # Editor components (shared)
│   └── collaboration/                 # Collaboration utilities (shared)
├── packages/
│   ├── yjs-server/                    # WebSocket server
│   │   ├── server.js                  # WS server + (optional) web app server
│   │   └── package.json
│   └── web-viewer/                    # SvelteKit web app
│       ├── src/routes/
│       │   ├── +page.svelte           # Landing page (join form)
│       │   └── kt/[code]/+page.svelte # Session viewer
│       ├── svelte.config.js           # adapter-node config
│       └── package.json
└── package.json                       # Workspace root
```

## What Was Implemented

### ✅ Monorepo Structure
- Converted project to npm workspaces
- Moved yjs-server to `packages/yjs-server/`
- Created `packages/web-viewer/` for SvelteKit app
- Configured shared component imports via `$shared` alias

### ✅ Web Viewer Application
- **Landing page** (`/`): Join session form
- **Session viewer** (`/kt/[code]`): Full collaborative editor
- **Smart URL sharing**: Desktop vs web URLs
- **QR code generation**: Always points to web viewer for mobile compatibility
- **Platform detection**: Shows appropriate share links based on environment

### ✅ Component Sharing
All components are shared between desktop and web:
- `SpeechEditor` - ProseMirror editor with Yjs sync
- `SubtitlePreview` - Real-time subtitle display
- `SessionStatus` - Connection status & participants
- `Toolbar` - Undo/redo/shortcuts (adapted for web)
- `ShareSessionModal` - Share URLs/QR codes

### ✅ Permission System
- ✅ Guests can edit text and confirm words
- ✅ Guests cannot use ASR/recording
- ✅ Guests cannot control auto-confirm
- ✅ Guests cannot create sessions

### ✅ URL Structure
- `https://tekstiks.ee/` - Landing page
- `https://tekstiks.ee/kt/ABC123` - Join session ABC123
- Desktop app: `kirikaja://join/ABC123` (deep link, future feature)

## Quick Start

### 1. Install Dependencies

```bash
# At project root
npm install
```

This installs all workspace dependencies including web-viewer.

### 2. Configure Environment Variables

Create `.env` file at root:

```env
# Yjs WebSocket Server URL
VITE_YJS_SERVER_URL=ws://localhost:1234

# Web Viewer Public URL
VITE_WEB_VIEWER_URL=http://localhost:1234
```

### 3. Development Mode

**Terminal 1 - Start Yjs Server:**
```bash
cd packages/yjs-server
npm start
```

**Terminal 2 - Start Web Viewer:**
```bash
cd packages/web-viewer
npm run dev
```

**Terminal 3 - Start Desktop App (optional):**
```bash
# At root
npm run electron:dev
```

### 4. Test Collaboration

1. Open desktop app, create a session
2. Click "Share" to get session code
3. Open browser to `http://localhost:5174/kt/CODE`
4. Edit from both desktop and web - changes sync instantly!

## Production Deployment

### Option A: Integrated Deployment (Recommended)

Deploy yjs-server and web-viewer together on the same origin.

**Step 1: Build Web Viewer**
```bash
cd packages/web-viewer
npm run build
```

**Step 2: Update yjs-server to serve built app**

Add to `packages/yjs-server/server.js`:

```javascript
import { handler } from '../web-viewer/build/handler.js';
import express from 'express';

const app = express();

// Serve static files from web-viewer
app.use(express.static('../web-viewer/build/client'));

// SvelteKit handler for SSR
app.use(handler);

// Upgrade to WebSocket for Yjs
const server = app.listen(PORT, HOST);
const wss = new WebSocket.Server({ server });
// ... rest of WebSocket setup
```

**Step 3: Deploy**

Deploy to Render/Railway/Fly.io:

```bash
# Example: Railway
railway init
railway up
```

Set environment variables:
- `PORT=1234`
- `VITE_YJS_SERVER_URL=wss://your-app.com`
- `VITE_WEB_VIEWER_URL=https://your-app.com`
- `ALLOWED_ORIGINS=https://your-app.com`

### Option B: Separate Deployment

Deploy web-viewer and yjs-server separately.

**Yjs Server:**
- Deploy to any Node.js host
- Configure CORS to allow web-viewer origin

**Web Viewer:**
- Build: `cd packages/web-viewer && npm run build`
- Deploy `build/` directory to Node.js host
- Set `VITE_YJS_SERVER_URL` to yjs-server URL

## Sharing Sessions

### From Desktop App

The `ShareSessionModal` now shows:

1. **Session Code**: `ABC123` (6 characters, always uppercase)
2. **Web Viewer URL**: `https://tekstiks.ee/kt/ABC123` (works everywhere)
3. **Desktop App URL**: `kirikaja://join/ABC123` (Electron deep link, if running in Electron)
4. **QR Code**: Always encodes web viewer URL for mobile compatibility

### Smart URL Detection

- **QR Code**: Always uses web viewer URL → mobile-friendly
- **Desktop users**: See both web and desktop URLs
- **Web users**: Only see web URL

### URL Examples

| Environment | URL Format | Opens In |
|------------|-----------|----------|
| Production Web | `https://tekstiks.ee/kt/ABC123` | Web browser |
| Local Web Dev | `http://localhost:5174/kt/ABC123` | Web browser |
| Desktop App | `${window.location.origin}?join=ABC123` | Electron app |
| Deep Link (future) | `kirikaja://join/ABC123` | Electron app |

## Component Compatibility

### Shared Components (Work in Both Environments)

All components in `src/lib/components/prosemirror-speech/` are platform-agnostic:

✅ No Electron-specific APIs
✅ Browser-compatible
✅ Use conditional rendering for platform-specific features:

```svelte
{#if sessionInfo?.role !== 'guest'}
  <!-- Only show in desktop or for hosts -->
  <RecordingControls />
{/if}
```

### Platform Detection

```typescript
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;
```

## Troubleshooting

### Web viewer can't connect to session

**Problem**: Stuck on "Connecting to session..."

**Solutions**:
1. Verify yjs-server is running: `curl http://localhost:1234/health`
2. Check `VITE_YJS_SERVER_URL` in .env
3. Check browser console for WebSocket errors
4. Verify CORS settings if using separate deployment

### "Module not found: $shared/..."

**Problem**: Web viewer can't import shared components

**Solutions**:
1. Run `npm install` at root level
2. Check `svelte.config.js` alias: `$shared: '../../src/lib'`
3. Verify files exist in `src/lib/`

### QR codes show wrong URL

**Problem**: QR code doesn't point to production web viewer

**Solutions**:
1. Set `VITE_WEB_VIEWER_URL=https://your-domain.com` in .env
2. Rebuild after changing environment variables
3. Verify in ShareSessionModal that `webJoinUrl` is correct

### Desktop app URL doesn't work

**Problem**: Clicking desktop app URL doesn't open

**Solutions**:
1. Desktop deep links (`kirikaja://`) require protocol handler (not yet implemented)
2. Use query parameter format instead: `${origin}?join=CODE`
3. Or copy session code manually

## Next Steps

### Recommended Enhancements

- [ ] Implement Electron deep link handler (`kirikaja://join/CODE`)
- [ ] Integrate yjs-server + web-viewer into single deployment
- [ ] Add session persistence for web viewers
- [ ] Implement session passwords/access control
- [ ] Add user names/avatars for web participants
- [ ] Export transcripts from web viewer
- [ ] Add mobile PWA support

### Deployment Checklist

- [ ] Build web-viewer: `npm run build`
- [ ] Deploy yjs-server with web-viewer or separately
- [ ] Configure environment variables
- [ ] Test WebSocket connectivity
- [ ] Test session joining from mobile
- [ ] Verify QR codes work
- [ ] Check CORS configuration
- [ ] Monitor `/health` and `/stats` endpoints

## Development Workflow

### Adding New Features

1. **Shared feature** (both desktop & web):
   - Add to `src/lib/components/` or `src/lib/`
   - Import via `$shared` in web-viewer
   - No platform-specific code

2. **Web-only feature**:
   - Add to `packages/web-viewer/src/lib/`
   - Standard SvelteKit imports

3. **Desktop-only feature**:
   - Add to Electron app
   - Guard with `if (isElectron)` if in shared component

### Testing Both Platforms

```bash
# Terminal 1: Yjs server
cd packages/yjs-server && npm start

# Terminal 2: Web viewer
cd packages/web-viewer && npm run dev

# Terminal 3: Desktop app
npm run electron:dev
```

Create session in desktop → Join from web → Test syncing!

## Support

- **Web Viewer Issues**: Check `packages/web-viewer/README.md`
- **Server Issues**: Check `packages/yjs-server/README.md`
- **Collaboration Issues**: Check `COLLABORATION_SETUP.md`

---

**🎉 You now have a fully functional web viewer for collaborative sessions!**
