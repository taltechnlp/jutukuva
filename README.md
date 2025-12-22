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

- Tuvastatud tekst ilmub redaktorisse reaalajas
- **Ootel sõnad** on esile tõstetud - need ootavad kinnitamist
- Vajuta **Enter**, et kinnitada kõik sõnad kuni kursori asukohani
- Lülita sisse **automaatne kinnitamine**, et sõnad kinnitataks automaatselt mõne sekundi pärast
- Vigu saab parandada otse tekstis

### Sessiooni jagamine

Jaga oma kõnetuvastuse sessiooni teistega:

1. **Sessiooni kood** - 6-kohaline kood (nt ABC123), mida teised saavad sisestada
2. **QR-kood** - skaneeri mobiilseadmega kiireks liitumiseks
3. **Veebilink** - jaga linki `tekstiks.ee/kt/KOOD` veebilehitseja kaudu vaatamiseks

Jagatud sessioonis saavad kõik osalejad:
- Näha teksti reaalajas
- Redigeerida ja parandada vigu
- Kinnitada sõnu

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
