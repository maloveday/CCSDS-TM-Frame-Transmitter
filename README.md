# CCSDS TM Frame Transmitter

A browser-based tool for constructing and transmitting **CCSDS TM (Telemetry) Transfer Frames** over WebSocket.
Built with React + TypeScript + Vite. Reference standard: [CCSDS 132.0-B-3](https://public.ccsds.org/Pubs/132x0b3.pdf).

---

## What Was Built

### Core Application

| Module | Description |
|--------|-------------|
| `src/utils/frameBuilder.ts` | Constructs complete CCSDS TM Transfer Frames per CCSDS 132.0-B-3. Handles the 6-byte primary header, optional secondary header, data field with idle-fill, OCF, and FECF. |
| `src/utils/crc.ts` | CRC-16/CCITT-FALSE implementation (init 0xFFFF, poly 0x1021, no reflection) used for the Frame Error Control Field. |
| `src/utils/hex.ts` | Hex/ASCII conversion utilities: parsing, formatting, hex-dump, and input validation. |
| `src/hooks/useTransmitter.ts` | React hook that manages a WebSocket connection and fires frames at a configurable interval. Tracks MCFC/VCFC counters with 8-bit wrap-around. |
| `src/components/FrameConfig.tsx` | Panel for all primary-header parameters: SCID, VCID, frame length, sync flag, FHP, and optional fields. |
| `src/components/PayloadInput.tsx` | Hex / ASCII payload editor with file-upload, capacity bar, and helper fill buttons (idle, ramp). |
| `src/components/TransmissionPanel.tsx` | WebSocket URL, interval control, start/stop, and live transmission statistics. |
| `src/components/FramePreview.tsx` | Live colour-coded hex dump with section legend (Primary Header, Secondary Header, Data Field, OCF, FECF). |

### Frame Structure

```
┌────────────────────┬──────────────────────┬───────────────┬──────────┬──────────┐
│  Primary Header    │  Secondary Header     │  Data Field   │  OCF     │  FECF    │
│  6 bytes           │  1–64 bytes (opt)     │  variable     │  4 bytes │  2 bytes │
│                    │                       │               │  (opt)   │  (opt)   │
└────────────────────┴──────────────────────┴───────────────┴──────────┴──────────┘
```

Total frame length: **7–2048 bytes**.

### Unit Tests

74 tests across three test suites using **Vitest**:

| Suite | Tests | Coverage |
|-------|-------|----------|
| `crc.test.ts` | 8 | CRC-16/CCITT-FALSE algorithm with known CCITT check vector (0x29B1) |
| `hex.test.ts` | 33 | `hexToBytes`, `bytesToHex`, `byteHex`, `asciiToBytes`, `hexDump`, `validateHexInput` |
| `frameBuilder.test.ts` | 33 | Frame construction, header encoding, optional fields, error cases, `availableDataBytes` |

### Docker Support

- **`Dockerfile`** — Multi-stage build: Node 22 builder → nginx 1.27 runtime. Final image is a minimal Alpine-based nginx container serving the pre-built SPA.
- **`nginx.conf`** — Serves the SPA with a fallback to `index.html` for client-side routing and long-lived cache headers for static assets.
- **`docker-compose.yml`** — Two services:
  - `app` — the transmitter UI on port `8080`
  - `ws-echo` — a lightweight WebSocket echo server on port `9000` for local testing

---

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Docker](https://www.docker.com/) (optional, for containerised deployment)

---

## Getting Started

### Local development

```bash
# Install dependencies
npm install

# Start the dev server (hot-reload)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Run tests

```bash
# Run all tests once
npm test

# Watch mode (re-runs on file save)
npm run test:watch

# Generate HTML coverage report in ./coverage/
npm run test:coverage
```

### Production build

```bash
npm run build
# Built files are in dist/
npm run preview   # preview the production build locally
```

---

## Docker Deployment

### Build and run with Docker Compose (recommended)

```bash
docker compose up --build
```

- Transmitter UI: [http://localhost:8080](http://localhost:8080)
- WebSocket echo server: `ws://localhost:9000`

To run only the transmitter UI (bring your own WebSocket receiver):

```bash
docker compose up --build app
```

### Build the image manually

```bash
docker build -t ccsds-tm-transmitter .
docker run -p 8080:80 ccsds-tm-transmitter
```

---

## User Guide

### 1. Configure the Frame

Use the **Frame Config** panel on the left to set:

| Field | Description |
|-------|-------------|
| **SCID** | Spacecraft ID (0–1023, 10 bits) |
| **VCID** | Virtual Channel ID (0–7, 3 bits) |
| **Frame Length** | Total frame size in bytes (7–2048) |
| **Sync Flag** | Set for byte-stream mode; clear for packet mode |
| **Packet Order Flag** | Only meaningful when Sync Flag is 0 |
| **Segment Length ID** | 0–3; `3` = unsegmented |
| **First Header Pointer** | Offset of first packet header in data field; `0x7FF` = no packet, `0x7FE` = idle |
| **Secondary Header** | Enable and paste hex data (1–63 bytes) |
| **OCF** | Enable and enter 4-byte hex Operational Control Field |
| **FECF** | Enable to append a CRC-16/CCITT-FALSE checksum |
| **Idle Fill Byte** | Byte value used to pad unused data field space (default `0xE0`) |

The **Available Payload** counter at the bottom of the panel shows how many bytes remain for user data given the current configuration.

### 2. Enter Payload Data

Use the **Payload** panel in the centre:

- Toggle between **Hex** and **ASCII** input modes.
- Type directly, or **drag-and-drop / browse** to upload a binary file.
- Use the helper buttons:
  - **Fill Idle** — fill the data field with the idle byte (`0xE0`)
  - **Fill Ramp** — fill with a 0x00–0xFF ramp pattern
  - **Clear** — clear the payload

The capacity bar turns amber when over 75% full and red when the payload exceeds the available space (excess bytes are silently truncated to fit).

### 3. Connect and Transmit

Use the **Transmission** panel on the right:

1. Enter the **WebSocket URL** (e.g. `ws://localhost:9000` or `ws://your-ground-station:4200`).
2. Set the **interval** (100 ms – 10 s, or type a custom value).
3. Click **Start** to begin transmitting.

Live statistics update on every frame sent:

| Stat | Description |
|------|-------------|
| **Frames Sent** | Total frame count since start |
| **Bytes Sent** | Total bytes transmitted |
| **MCFC** | Master Channel Frame Count (0–255, wraps) |
| **VCFC** | Virtual Channel Frame Count (0–255, wraps) |

Click **Stop** to halt transmission. The WebSocket connection is closed automatically.

### 4. Inspect the Frame

The **Frame Preview** at the bottom shows the currently assembled frame as a live hex dump.
Each section is colour-coded:

| Colour | Section |
|--------|---------|
| Blue | Primary Header |
| Purple | Secondary Header |
| Green | Data Field |
| Amber | OCF |
| Red | FECF |

---

## Project Structure

```
.
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
├── index.html
├── vite.config.ts
├── package.json
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── types.ts
    ├── components/
    │   ├── FrameConfig.tsx
    │   ├── FramePreview.tsx
    │   ├── PayloadInput.tsx
    │   └── TransmissionPanel.tsx
    ├── hooks/
    │   └── useTransmitter.ts
    └── utils/
        ├── crc.ts
        ├── crc.test.ts
        ├── frameBuilder.ts
        ├── frameBuilder.test.ts
        ├── hex.ts
        └── hex.test.ts
```

---

## License

MIT
