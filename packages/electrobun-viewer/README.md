# Jutukuva Viewer (Electrobun)

Lightweight desktop application for viewing Jutukuva subtitles with an optional always-on-top overlay mode. Built with [Electrobun](https://blackboard.sh/electrobun/docs/) for ~10x smaller download size compared to Electron.

## Features

- **Lightweight**: ~15MB download vs ~150MB with Electron
- **Web Viewer Integration**: Same collaborative editing experience as the web version
- **Overlay Subtitles**: Always-on-top subtitle display for use on top of other apps
- **Fully Configurable**: Font, colors, size, position, and transparency settings
- **Cross-platform**: macOS, Windows, Linux (uses system webview)

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) installed on your system
- The yjs-server running (for collaboration)

### Development

```bash
# Install dependencies
bun install

# Build web-viewer and start the app
bun dev

# Or run individual steps:
bun run build:viewer   # Build web-viewer
bun start              # Start Electrobun app
```

### Production Build

```bash
bun run build:prod
```

This creates distribution packages in the `build/` directory.

### Linux Build Notes

On Linux with a monorepo setup, you may need to create a symlink for electrobun to find its dependencies:

```bash
mkdir -p node_modules
ln -sf ../../../node_modules/electrobun node_modules/electrobun
```

### Running the Built App

**macOS:**
```bash
open build/dev-darwin-*/JutukuvaViewer-dev.app
```

**Linux:**
```bash
cd build/dev-linux-x64/JutukuvaViewer-dev/bin
LD_LIBRARY_PATH=.:$LD_LIBRARY_PATH ./bun ../Resources/main.js
```

Note: On Linux, you must run from the `bin/` directory so paths resolve correctly, and `LD_LIBRARY_PATH` must include the current directory for `libasar.so`.

## Features

### Session Joining

1. Enter a 6-character session code
2. Click "Join" or press Enter
3. The collaborative editor loads in the main window

### Overlay Mode

1. Join a session
2. Click the "Overlay" button in the toolbar
3. A subtitle window appears on top of other applications
4. Configure appearance via Settings

### Settings

Access settings via the gear icon in the titlebar:

**Connection:**
- WebSocket Server URL
- Web Viewer URL

**Overlay:**
- Position preset (Top, Center, Bottom)
- Window size
- Opacity
- Click-through mode

**Font & Colors:**
- Font family
- Font size and weight
- Text color
- Background color and opacity

## Project Structure

```
electrobun-viewer/
├── src/
│   ├── bun/                    # Bun main process
│   │   ├── index.ts            # Entry point
│   │   ├── overlay-window.ts   # Overlay window manager
│   │   └── settings-manager.ts # Settings persistence
│   └── views/                  # Renderer views
│       ├── main/               # Main window UI
│       ├── overlay/            # Overlay window UI
│       └── viewer/             # Web-viewer build (generated)
├── scripts/
│   └── build-viewer.ts         # Build script
├── electrobun.config.ts        # Electrobun config
├── package.json
└── tsconfig.json
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Electrobun Application                   │
├─────────────────────────────────────────────────────────────┤
│  Bun Process (main)                                         │
│  ├── Window Management                                      │
│  ├── Settings Manager (JSON persistence)                    │
│  └── IPC Handlers                                           │
├─────────────────────────────────────────────────────────────┤
│  Main Window                    │  Overlay Window           │
│  ├── Session Join UI           │  ├── Subtitle Display     │
│  ├── Web Viewer (iframe)       │  ├── Dynamic Styling      │
│  └── Settings Modal            │  └── Click-through Mode   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │   yjs-server    │
                  │   (WebSocket)   │
                  └─────────────────┘
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + O` | Toggle overlay |
| `Escape` | Close settings modal |
| `Double-click` overlay | Toggle click-through mode |

## Comparison with Electron Version

| Feature | Electrobun | Electron |
|---------|------------|----------|
| Download size | ~15MB | ~150MB |
| Memory usage | Lower | Higher |
| Startup time | Faster | Slower |
| Browser engine | System (WebKit/Edge/GTK) | Chromium |
| Native features | Limited | Full |

## Troubleshooting

### App won't start
- Ensure Bun is installed: `bun --version`
- Ensure dependencies are installed: `bun install`

### Can't connect to session
- Verify yjs-server is running
- Check WebSocket URL in settings

### Overlay not visible
- Check if another app is blocking it
- Try different position preset
- Verify opacity setting

## License

ISC
