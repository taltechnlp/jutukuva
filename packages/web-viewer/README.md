# Kirikaja Web Viewer

Web-based collaborative viewer for Kirikaja speech editing sessions.

## Overview

The web viewer allows users to join collaborative editing sessions via a web browser without installing the desktop app. It provides full editing and word confirmation capabilities in guest mode.

## Features

- **Join via URL**: Access sessions using `/kt/SESSION_CODE` URLs
- **Full editing**: Edit text and confirm words (same permissions as desktop guest)
- **Real-time sync**: See changes from all participants instantly
- **QR code support**: Mobile-friendly joining via QR codes
- **No recording**: Recording/ASR features are disabled (desktop-only)
- **Responsive design**: Works on desktop and mobile browsers

## Development

### Prerequisites

- Node.js 20+
- npm workspaces (configured at root level)

### Local Development

1. **Start the Yjs server** (in separate terminal):
   ```bash
   cd packages/yjs-server
   npm start
   ```

2. **Start the web viewer dev server**:
   ```bash
   cd packages/web-viewer
   npm run dev
   ```

   The web viewer will be available at `http://localhost:5174`

3. **Join a session**:
   - Navigate to `http://localhost:5174`
   - Enter a 6-character session code
   - Or visit directly: `http://localhost:5174/kt/ABC123`

### Building for Production

```bash
npm run build
```

This creates a production build in the `build/` directory using `@sveltejs/adapter-node`.

## Deployment

### Option 1: Integrated with yjs-server (Recommended)

The web viewer can be served by the same Node.js server as the Yjs WebSocket server:

1. **Build the web viewer**:
   ```bash
   cd packages/web-viewer
   npm run build
   ```

2. **Update yjs-server to serve the built app** (see packages/yjs-server/README.md)

3. **Deploy together**:
   - Both WebSocket and web viewer on same origin
   - Simplifies CORS and SSL configuration
   - Single deployment artifact

### Option 2: Separate Deployment

Deploy the web viewer to any Node.js hosting platform:

**Render / Railway / Fly.io:**
1. Build the app: `npm run build`
2. Deploy the `build/` directory
3. Set environment variables:
   - `VITE_YJS_SERVER_URL=wss://your-yjs-server.com`
4. Configure CORS on yjs-server to allow your web viewer origin

### Environment Variables

Create `.env` file or set in deployment platform:

```env
# WebSocket server URL (required)
VITE_YJS_SERVER_URL=wss://tekstiks.ee

# Web viewer public URL (for sharing)
VITE_WEB_VIEWER_URL=https://tekstiks.ee
```

## URL Structure

- `/` - Landing page with "Join Session" form
- `/kt/[code]` - Session viewer (auto-joins session)

### Example URLs

- Production: `https://tekstiks.ee/kt/AB1234`
- Local dev: `http://localhost:5174/kt/AB1234`

## Component Sharing

The web viewer imports components from the main Electron app using the `$shared` alias:

```typescript
import { SpeechEditor } from '$shared/components/prosemirror-speech';
import { CollaborationManager } from '$shared/collaboration/CollaborationManager';
```

This is configured in `svelte.config.js`:

```javascript
alias: {
  $shared: '../../src/lib'
}
```

## Features vs. Desktop App

| Feature | Web Viewer | Desktop App |
|---------|-----------|-------------|
| Join sessions | ✅ | ✅ |
| Create sessions | ❌ | ✅ |
| Edit text | ✅ | ✅ |
| Confirm words | ✅ | ✅ |
| ASR/Recording | ❌ | ✅ |
| Auto-confirm control | ❌ | ✅ (host) |
| Save to database | ❌ | ✅ |

## Browser Compatibility

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## Troubleshooting

### Cannot connect to session

- Verify `VITE_YJS_SERVER_URL` is correct
- Check that yjs-server is running
- Ensure WebSocket connections are allowed (check firewall/proxy)

### Components not found

- Run `npm install` at root level to setup workspaces
- Verify `$shared` alias in `svelte.config.js`
- Check that shared components exist in `../../src/lib`

### QR code not generating

- Ensure `qrcode` package is installed
- Check browser console for errors
- Verify `VITE_WEB_VIEWER_URL` is set correctly

## Development Notes

- Uses Svelte 5 with runes (`$state`, `$props`, `$derived`)
- Tailwind CSS + DaisyUI for styling
- Same component library as desktop app (100% shared)
- i18n support (Estonian, English, Finnish)

## License

ISC
