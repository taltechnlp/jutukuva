# Yjs WebSocket Server

WebSocket server for syncing ProseMirror editor state across multiple clients using Yjs CRDT.

## Features

- Real-time collaborative editing
- WebSocket-based synchronization
- Automatic conflict resolution using CRDTs
- Support for ProseMirror documents
- Room-based session management
- CORS support for production deployments
- Health check and stats endpoints
- Automatic session cleanup

## Installation

```bash
npm install
```

## Usage

Start the server:

```bash
npm start
```

For development:

```bash
npm run dev
```

## Configuration

The server can be configured using environment variables:

- `PORT` - Server port (default: 1234)
- `HOST` - Server host (default: 0.0.0.0)
- `ALLOWED_ORIGINS` - Comma-separated list of allowed origins for CORS (default: *)

Example:

```bash
PORT=8080 HOST=0.0.0.0 ALLOWED_ORIGINS=https://yourdomain.com npm start
```

## Endpoints

- `/` - Server info
- `/health` - Health check endpoint (returns active sessions count)
- `/stats` - Session statistics (returns list of active rooms with connection counts)

## Client Connection

Connect to the server from your client application using a room name (session code):

```javascript
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { ySyncPlugin, yCursorPlugin } from 'y-prosemirror'

const ydoc = new Y.Doc()
const roomName = 'A3F9K2' // Session code

// Connect to specific room
const provider = new WebsocketProvider(
  'ws://localhost:1234',
  roomName,
  ydoc
)

// Get ProseMirror plugins
const type = ydoc.getXmlFragment('prosemirror')
const plugins = [
  ySyncPlugin(type),
  yCursorPlugin(provider.awareness),
  // ... other plugins
]
```

Each room is isolated - users connecting to the same room name will share the same document state.

## License

ISC
