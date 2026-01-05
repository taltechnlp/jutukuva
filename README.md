# Jutukuva

Reaalajas eestikeelse kõne tekstiks muutmise rakendus. Rakendus tuvastab kõne automaatselt ja kuvab selle tekstina, mida saab koheselt redigeerida ja teistega jagada.

## Allalaadimine

### Jutukuva (põhirakendus)

| Platvorm | Allalaadimine |
|----------|---------------|
| Windows | [Jutukuva.Setup.0.8.0.exe](https://github.com/taltechnlp/jutukuva/releases/download/v0.8.0/Jutukuva.Setup.0.8.0.exe) |
| macOS (Intel) | [Jutukuva-0.8.0.dmg](https://github.com/taltechnlp/jutukuva/releases/download/v0.8.0/Jutukuva-0.8.0.dmg) |
| macOS (Apple Silicon) | [Jutukuva-0.8.0-arm64.dmg](https://github.com/taltechnlp/jutukuva/releases/download/v0.8.0/Jutukuva-0.8.0-arm64.dmg) |
| Linux | [Jutukuva-0.8.0.AppImage](https://github.com/taltechnlp/jutukuva/releases/download/v0.8.0/Jutukuva-0.8.0.AppImage) |

### Jutukuva Subtiitrid (ülekatte rakendus)

Kuvab subtiitreid mis tahes rakenduse kohal - ideaalne videokõnede, esitluste ja otseülekannete jaoks.

| Platvorm | Allalaadimine |
|----------|---------------|
| Windows | [Jutukuva.Subtiitrid_0.8.0_x64-setup.exe](https://github.com/taltechnlp/jutukuva/releases/download/v0.8.0/Jutukuva.Subtiitrid_0.8.0_x64-setup.exe) |
| macOS | [Jutukuva.Subtiitrid_0.8.0_aarch64.dmg](https://github.com/taltechnlp/jutukuva/releases/download/v0.8.0/Jutukuva.Subtiitrid_0.8.0_aarch64.dmg) |
| Linux (AppImage) | [Jutukuva.Subtiitrid_0.8.0_amd64.AppImage](https://github.com/taltechnlp/jutukuva/releases/download/v0.8.0/Jutukuva.Subtiitrid_0.8.0_amd64.AppImage) |
| Linux (Debian) | [Jutukuva.Subtiitrid_0.8.0_amd64.deb](https://github.com/taltechnlp/jutukuva/releases/download/v0.8.0/Jutukuva.Subtiitrid_0.8.0_amd64.deb) |

---

## Kasutusjuhend

### Alustamine

1. **Lae rakendus alla** ja paigalda see oma arvutisse
2. **Käivita Jutukuva**
3. **Vali heliallikas:**
   - **Mikrofon** - oma kõne salvestamiseks
   - **Süsteemiheli** - arvutist tuleva heli salvestamiseks (nt videokõne)
4. **Vajuta salvestamise nuppu** - kõnetuvastus käivitub automaatselt

### Teksti redigeerimine

- Tuvastatud tekst ilmub redaktorisse kohe, kui räägid
- Teksti saab redigeerida paralleelselt kõnetuvastusega
- Vigu saab parandada otse tekstis

**Kiirklahvid:**
| Klahv | Tegevus |
|-------|---------|
| **Enter** | Loo uus lõik |
| **Ctrl+Enter** | Uus lõik ja vali kõneleja |
| **Ctrl+Z** | Võta tagasi |
| **Ctrl+Shift+Z** | Tee uuesti |
| **Tab** | Vali järgmine sõna |
| **Shift+Tab** | Vali eelmine sõna |

### Asendussõnastikud

Asendussõnastikud võimaldavad lühendeid automaatselt pikemaks tekstiks muuta:

1. Ava **Asendused** menüüst
2. Loo uus sõnastik või vali olemasolev
3. Lisa kirjeid: päästik (nt "tln") → asendus (nt "Tallinn")

Kasutamine:
- Kirjuta päästik ja näed asenduse eelvaadet
- Vajuta **Tühik** asenduse rakendamiseks
- Vajuta **Escape** asenduse tühistamiseks

Sõnastikke saab importida ja eksportida JSON formaadis.

### Sessiooni jagamine

Jaga oma kõnetuvastuse sessiooni teistega:

1. **Sessiooni kood** - 6-kohaline kood (nt ABC123), mida teised saavad sisestada
2. **QR-kood** - skaneeri mobiilseadmega kiireks liitumiseks
3. **Veebilink** - jaga linki `tekstiks.ee/kt/KOOD` veebilehitseja kaudu vaatamiseks

Jagatud sessioonis saavad kõik osalejad:
- Näha teksti reaalajas
- Redigeerida ja parandada vigu

### Ülekatte subtiitrite kasutamine

**Jutukuva Subtiitrid** kuvab subtiitreid läbipaistva aknana mis tahes rakenduse kohal:

1. Paigalda **Jutukuva Subtiitrid** rakendus
2. Käivita põhirakenduses sessioon
3. Ava **Jutukuva Subtiitrid** ja sisesta sessiooni kood
4. Liiguta subtiitrite aken soovitud kohta ekraanil

Alternatiivina saab ülekatte rakenduse avada otse põhirakendusest jagamise dialoogist.

---

## Nõuanded

- **Kasuta kvaliteetset mikrofoni** - selgem heli annab parema tulemuse
- **Räägi selgelt ja mõõdukas tempos** - kiire kõne võib tekitada rohkem vigu
- **Vaikne keskkond** - taustamüra võib segada tuvastust
- **Eesti keel** - rakendus on optimeeritud eesti keele tuvastamiseks

### Andmebaasi asukoht

Rakenduse andmed salvestatakse:
- **Linux:** `~/.config/jutukuva/database.sqlite`
- **macOS:** `~/Library/Application Support/jutukuva/database.sqlite`
- **Windows:** `%APPDATA%/jutukuva/database.sqlite`

---

## Panustamine

Vigade raporteerimiseks või ettepanekute tegemiseks:
- Loo [GitHub issue](https://github.com/taltechnlp/jutukuva/issues)

---

## Tehniline ülevaade

### Tehnoloogiad

- **SvelteKit** - kasutajaliidese raamistik
- **Electron** - töölauarakenduse raamistik (põhirakendus)
- **Tauri** - töölauarakenduse raamistik (ülekatte rakendus)
- **SQLite** - kohalik andmebaas (better-sqlite3)
- **sherpa-onnx** - kõnetuvastuse mootor
- **Yjs** - reaalajas koostöö (CRDT)
- **ProseMirror** - tekstiredaktor

### Projekti struktuur

```
kirikaja/
├── electron/           # Electron põhiprotsess
├── src/                # SvelteKit kasutajaliides
├── packages/
│   ├── overlay-captions/  # Tauri ülekatte rakendus
│   ├── web-viewer/        # Veebivaataja server
│   └── yjs-server/        # Koostöö sünkroniseerimise server
└── build/              # Ehituse väljund
```

### Arendamine

```bash
# Sõltuvuste paigaldamine
npm install

# Arendusrežiimis käivitamine
npm run electron:dev

# Tootmisversiooni ehitamine
npm run electron:build
```

## Litsents

MIT

---

# English

# Jutukuva

A real-time Estonian speech-to-text application. The app automatically detects speech and displays it as text that can be instantly edited and shared with others.

## Download

### Jutukuva (main application)

| Platform | Download |
|----------|----------|
| Windows | [Jutukuva.Setup.0.8.0.exe](https://github.com/taltechnlp/jutukuva/releases/download/v0.8.0/Jutukuva.Setup.0.8.0.exe) |
| macOS (Intel) | [Jutukuva-0.8.0.dmg](https://github.com/taltechnlp/jutukuva/releases/download/v0.8.0/Jutukuva-0.8.0.dmg) |
| macOS (Apple Silicon) | [Jutukuva-0.8.0-arm64.dmg](https://github.com/taltechnlp/jutukuva/releases/download/v0.8.0/Jutukuva-0.8.0-arm64.dmg) |
| Linux | [Jutukuva-0.8.0.AppImage](https://github.com/taltechnlp/jutukuva/releases/download/v0.8.0/Jutukuva-0.8.0.AppImage) |

### Jutukuva Subtitles (overlay application)

Displays subtitles on top of any application - ideal for video calls, presentations, and live broadcasts.

| Platform | Download |
|----------|----------|
| Windows | [Jutukuva.Subtiitrid_0.8.0_x64-setup.exe](https://github.com/taltechnlp/jutukuva/releases/download/v0.8.0/Jutukuva.Subtiitrid_0.8.0_x64-setup.exe) |
| macOS | [Jutukuva.Subtiitrid_0.8.0_aarch64.dmg](https://github.com/taltechnlp/jutukuva/releases/download/v0.8.0/Jutukuva.Subtiitrid_0.8.0_aarch64.dmg) |
| Linux (AppImage) | [Jutukuva.Subtiitrid_0.8.0_amd64.AppImage](https://github.com/taltechnlp/jutukuva/releases/download/v0.8.0/Jutukuva.Subtiitrid_0.8.0_amd64.AppImage) |
| Linux (Debian) | [Jutukuva.Subtiitrid_0.8.0_amd64.deb](https://github.com/taltechnlp/jutukuva/releases/download/v0.8.0/Jutukuva.Subtiitrid_0.8.0_amd64.deb) |

---

## User Guide

### Getting Started

1. **Download the application** and install it on your computer
2. **Launch Jutukuva**
3. **Select an audio source:**
   - **Microphone** - to record your own speech
   - **System audio** - to record audio from your computer (e.g., video calls)
4. **Press the record button** - speech recognition starts automatically

### Text Editing

- Recognized text appears in the editor as you speak
- Text can be edited in parallel with speech recognition
- Errors can be corrected directly in the text

**Keyboard Shortcuts:**
| Key | Action |
|-----|--------|
| **Enter** | Create new paragraph |
| **Ctrl+Enter** | New paragraph and select speaker |
| **Ctrl+Z** | Undo |
| **Ctrl+Shift+Z** | Redo |
| **Tab** | Select next word |
| **Shift+Tab** | Select previous word |

### Substitution Dictionaries

Substitution dictionaries allow you to automatically expand abbreviations into longer text:

1. Open **Substitutions** from the menu
2. Create a new dictionary or select an existing one
3. Add entries: trigger (e.g., "tln") → replacement (e.g., "Tallinn")

Usage:
- Type the trigger and see a preview of the replacement
- Press **Space** to apply the replacement
- Press **Escape** to cancel the replacement

Dictionaries can be imported and exported in JSON format.

### Session Sharing

Share your speech recognition session with others:

1. **Session code** - a 6-character code (e.g., ABC123) that others can enter
2. **QR code** - scan with a mobile device for quick access
3. **Web link** - share a link `tekstiks.ee/kt/CODE` for viewing in a browser

In a shared session, all participants can:
- See text in real-time
- Edit and correct errors

### Using Overlay Subtitles

**Jutukuva Subtitles** displays subtitles as a transparent window on top of any application:

1. Install the **Jutukuva Subtitles** application
2. Start a session in the main application
3. Open **Jutukuva Subtitles** and enter the session code
4. Move the subtitle window to the desired location on screen

Alternatively, the overlay application can be opened directly from the sharing dialog in the main application.

---

## Tips

- **Use a quality microphone** - clearer audio produces better results
- **Speak clearly at a moderate pace** - fast speech may cause more errors
- **Quiet environment** - background noise can interfere with recognition
- **Estonian language** - the application is optimized for Estonian speech recognition

### Database Location

Application data is stored at:
- **Linux:** `~/.config/jutukuva/database.sqlite`
- **macOS:** `~/Library/Application Support/jutukuva/database.sqlite`
- **Windows:** `%APPDATA%/jutukuva/database.sqlite`

---

## Contributing

To report bugs or make suggestions:
- Create a [GitHub issue](https://github.com/taltechnlp/jutukuva/issues)

---

## Technical Overview

### Technologies

- **SvelteKit** - UI framework
- **Electron** - desktop application framework (main app)
- **Tauri** - desktop application framework (overlay app)
- **SQLite** - local database (better-sqlite3)
- **sherpa-onnx** - speech recognition engine
- **Yjs** - real-time collaboration (CRDT)
- **ProseMirror** - text editor

### Project Structure

```
kirikaja/
├── electron/           # Electron main process
├── src/                # SvelteKit user interface
├── packages/
│   ├── overlay-captions/  # Tauri overlay application
│   ├── web-viewer/        # Web viewer server
│   └── yjs-server/        # Collaboration sync server
└── build/              # Build output
```

### Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run electron:dev

# Build for production
npm run electron:build
```

## License

MIT
