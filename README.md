# Kirikaja

A desktop application built with SvelteKit, Electron, SQLite, and TypeScript.

## Tech Stack

- **SvelteKit** - Web framework with adapter-static for SSG
- **Electron** - Desktop application framework
- **SQLite** - Local database via better-sqlite3
- **TypeScript** - Type-safe development
- **Vite** - Build tool and dev server

## Project Structure

```
kirikaja/
├── electron/
│   ├── main.js          # Electron main process
│   ├── preload.js       # Preload script for IPC
│   └── database.js      # SQLite database handler
├── src/
│   ├── routes/
│   │   ├── +layout.ts   # SvelteKit layout config
│   │   └── +page.svelte # Main application page
│   ├── app.html         # HTML template
│   └── app.d.ts         # TypeScript declarations
├── build/               # SvelteKit build output
├── dist/                # Electron build output
├── package.json
├── svelte.config.js
├── vite.config.ts
└── tsconfig.json
```

## Development

### Install dependencies

```bash
npm install
```

### Run in development mode

```bash
npm run electron:dev
```

This will:
1. Start the Vite dev server on port 5173
2. Launch Electron and load the app
3. Open DevTools automatically

### Build for production

```bash
npm run electron:build
```

This will:
1. Build the SvelteKit app to static files
2. Package the Electron app with electron-builder
3. Output to the `dist/` directory

### Run the built app

After running `npm run build`, you can run the app without packaging:

```bash
npx electron . --no-sandbox
```

Or if you have Electron installed globally:

```bash
electron . --no-sandbox
```

This is useful for testing the production build before creating a distributable package.

To run the packaged app from `dist/`:

```bash
# Linux
./dist/kirikaja-0.0.1-x86_64.AppImage

# macOS
open dist/mac/Kirikaja.app

# Windows
dist\win-unpacked\Kirikaja.exe
```

## Database

The app uses SQLite with better-sqlite3. The database file is stored in the user data directory:

- **Linux**: `~/.config/kirikaja/database.sqlite`
- **macOS**: `~/Library/Application Support/kirikaja/database.sqlite`
- **Windows**: `%APPDATA%/kirikaja/database.sqlite`

### Database API

The database is accessed from the renderer process via IPC:

```typescript
// Get a setting
const value = await window.db.getSetting('key');

// Set a setting
await window.db.setSetting('key', 'value');

// Get all settings
const settings = await window.db.getAllSettings();
```

## Scripts

- `npm run dev` - Start Vite dev server only
- `npm run build` - Build SvelteKit app
- `npm run preview` - Preview production build
- `npm run check` - Run TypeScript and Svelte checks
- `npm run electron:dev` - Run app in Electron with hot reload
- `npm run electron:build` - Build production Electron app

## License

MIT
