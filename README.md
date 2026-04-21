# CCSDS TM Frame Transmitter

A browser-based tool for constructing and transmitting **CCSDS TM (Telemetry) Transfer Frames** — optionally encapsulated in a **Channel Access Data Unit (CADU)** — over WebSocket.
Built with React + TypeScript + Vite. Reference standards: [CCSDS 132.0-B-3](https://public.ccsds.org/Pubs/132x0b3.pdf) (Transfer Frames) · [CCSDS 131.0-B-5](https://ccsds.org/Pubs/131x0b5.pdf) (TM Synchronization and Channel Coding).

---

## What Was Built

### Core Application

| Module | Description |
|--------|-------------|
| `src/utils/frameBuilder.ts` | Constructs complete CCSDS TM Transfer Frames per CCSDS 132.0-B-3. Handles the 6-byte primary header, optional secondary header, data field with idle-fill, OCF, and FECF. |
| `src/utils/cadu.ts` | CADU encapsulation per CCSDS 131.0-B-5. Prepends the 4-byte ASM (`1A CF FC 1D`). Supports three payload types: Transfer Frame, Reed-Solomon coded, and raw Codeword. Optionally applies PRBS pseudo-randomization. |
| `src/utils/reedSolomon.ts` | Reed-Solomon encoder per CCSDS 131.0-B-5 §4. GF(2⁸) with primitive polynomial 0x187. Supports RS(255,223) and RS(255,239) with interleave depths 1, 2, 3, 4, 5, 8. Includes syndrome validation. |
| `src/utils/crc.ts` | CRC-16/CCITT-FALSE implementation (init 0xFFFF, poly 0x1021, no reflection) used for the Frame Error Control Field. |
| `src/utils/hex.ts` | Hex/ASCII conversion utilities: parsing, formatting, hex-dump, and input validation. |
| `src/hooks/useTransmitter.ts` | React hook that manages a WebSocket connection and fires frames at a configurable interval. Wraps the frame in a CADU (with the selected payload type) when enabled. Tracks MCFC/VCFC counters with 8-bit wrap-around. |
| `src/components/FrameConfig.tsx` | Panel for all primary-header parameters: SCID, VCID, frame length, sync flag, FHP, optional fields, and CADU encapsulation with payload dependency selection. |
| `src/components/PayloadInput.tsx` | Hex / ASCII payload editor with file-upload, capacity bar, and helper fill buttons (idle, ramp). |
| `src/components/TransmissionPanel.tsx` | WebSocket URL, interval control, start/stop, and live transmission statistics. |
| `src/components/FramePreview.tsx` | Live colour-coded hex dump with section legend (ASM, Primary Header, Secondary Header, Data Field, OCF, FECF, RS Data, RS Check, Codeword). |

### Frame Structure

TM Transfer Frame (CCSDS 132.0-B-3):
```
┌────────────────────┬──────────────────────┬───────────────┬──────────┬──────────┐
│  Primary Header    │  Secondary Header     │  Data Field   │  OCF     │  FECF    │
│  6 bytes           │  1–64 bytes (opt)     │  variable     │  4 bytes │  2 bytes │
│                    │                       │               │  (opt)   │  (opt)   │
└────────────────────┴──────────────────────┴───────────────┴──────────┴──────────┘
```

Total frame length: **7–2048 bytes**.

CADU (CCSDS 131.0-B-5), when enabled:
```
┌──────────┬───────────────────────────────────────────────────────────────────────┐
│  ASM     │  Transfer Frame  (optionally PRBS pseudo-randomized)                  │
│  4 bytes │  7–2048 bytes                                                         │
└──────────┴───────────────────────────────────────────────────────────────────────┘
  1A CF FC 1D
```

### Unit Tests

134 tests across five test suites using **Vitest**:

| Suite | Tests | Coverage |
|-------|-------|----------|
| `crc.test.ts` | 8 | CRC-16/CCITT-FALSE algorithm with known CCITT check vector (0x29B1) |
| `hex.test.ts` | 33 | `hexToBytes`, `bytesToHex`, `byteHex`, `asciiToBytes`, `hexDump`, `validateHexInput` |
| `frameBuilder.test.ts` | 33 | Frame construction, header encoding, optional fields, error cases, `availableDataBytes` |
| `cadu.test.ts` | 27 | ASM value, CADU structure, section offsetting, PRBS sequence vectors, RS payload, codeword payload |
| `reedSolomon.test.ts` | 33 | GF(2⁸) table correctness, generator polynomial roots, systematic encoding, syndrome validation, interleaving |

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
| **Enable CADU** | Wraps the completed Transfer Frame in a CADU (prepends ASM `1A CF FC 1D`) |
| **Payload Dependency** | Selects what fills the CADU payload: Transfer Frame, Reed-Solomon, or Codeword (visible only when CADU is enabled) |
| **RS Variant** | RS(255,223) or RS(255,239) code rate (visible when Payload = Reed-Solomon) |
| **Interleave Depth** | Number of independently encoded RS sub-blocks: 1, 2, 3, 4, 5, or 8 (visible when Payload = Reed-Solomon) |
| **Codeword Data** | Raw hex bytes used directly as CADU payload (visible when Payload = Codeword) |
| **Pseudo-randomization** | Applies CCSDS PRBS to the payload bytes before transmission (visible only when CADU is enabled) |

The **Available Payload** counter at the bottom of the panel shows how many bytes remain for user data given the current configuration.

#### CADU Encapsulation (CCSDS 131.0-B-5)

When **Enable CADU** is toggled on in the *CADU Encapsulation* section of the Frame Config panel:

- The 4-byte **Attached Synchronization Marker (ASM)** `1A CF FC 1D` is prepended to every outgoing frame.
- The bytes-sent counter and Frame Preview reflect the full CADU size.

##### Payload Dependency

The **Payload Dependency** dropdown selects what occupies the CADU payload (after the ASM):

**1. Transfer Frame** (default)
- CADU payload = the completed TM Transfer Frame bytes.
- CADU size = frame length + 4 bytes.

**2. Reed-Solomon**
- The Transfer Frame data is RS-encoded using the selected code variant and interleave depth.
- CADU payload = I×255 bytes of RS-coded data (data + check symbols, byte-interleaved when I > 1).
- Supported variants (CCSDS 131.0-B-5 §4, GF(2⁸), primitive polynomial 0x187, FCR=112):

  | Variant | Data bytes (k) | Check bytes (2t) | Error correction |
  |---------|---------------|------------------|------------------|
  | RS(255,223) | 223 | 32 | E=16 symbol errors |
  | RS(255,239) | 239 | 16 | E=8 symbol errors |

- **Interleave Depth (I)**: 1, 2, 3, 4, 5, or 8 independent codewords. Total payload = I×255 bytes. The Transfer Frame data is zero-padded or truncated to k×I bytes to match the RS input requirement.
- The Frame Preview colour-codes the **RS Data** (green) and **RS Check** (pink) sections within the CADU.

**3. Codeword**
- Enter arbitrary hex bytes in the **Codeword Data** field.
- CADU payload = the raw codeword bytes exactly as entered.
- Useful for injecting pre-computed or externally generated channel codewords.

##### Pseudo-randomization (PRBS)

When enabled, the payload bytes (not the ASM) are XOR'd with the output of a Fibonacci LFSR prior to transmission:
- Generator polynomial: h(x) = x⁸ + x⁷ + x⁵ + x³ + 1
- Initial fill: `0xFF` (all ones)
- Period: 255 bits
- Self-inverse — applying PRBS twice recovers the original data.

The header bar shows a badge indicating the active CADU mode:
- **CADU** — Transfer Frame only
- **CADU+RS(255,223)** — Reed-Solomon RS(255,223)
- **CADU+RS(255,239)×5** — Reed-Solomon RS(255,239) with interleave depth 5
- **CADU+CW** — Raw Codeword
- Append **+PRBS** to any of the above when randomization is active.

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
| Orange | ASM (CADU only) |
| Blue | Primary Header |
| Purple | Secondary Header |
| Green | Data Field |
| Amber | OCF |
| Red | FECF |

---

## Monitoring Frames with Postman

Postman's built-in WebSocket client lets you connect to any WebSocket server and inspect the raw binary frames sent by the transmitter.

### Steps

1. **Open Postman** and click **New** (top-left), then select **WebSocket** from the request type list.

2. **Enter the server URL** in the address bar at the top of the new tab.
   - If using the bundled echo server from Docker Compose: `ws://localhost:9000`
   - If connecting to your own receiver: use its URL (e.g. `ws://192.168.1.10:4200`)

3. **Click Connect.** The status badge next to the URL changes to **Connected** (green).

4. **Open the Messages tab** (below the URL bar). This panel will display every frame that the server receives and echoes back.

5. **Start transmitting** from the CCSDS TM Frame Transmitter UI — click **▶ Start** in the Transmission panel.

6. **Observe incoming frames.** Each frame appears as a new row in the Messages panel, labelled **Binary**. The size shown matches the frame length configured in the app.

7. **Inspect a frame's bytes** — click any message row to expand it, then select the **Hex** view from the format toggle. The byte layout matches the colour-coded Frame Preview in the transmitter:

   | Bytes | Field |
   |-------|-------|
   | 0–5 | Primary Header |
   | 6–N | Secondary Header (if enabled) |
   | next | Data Field (payload + idle fill) |
   | last 4 | OCF (if enabled) |
   | last 2 | FECF / CRC-16 (if enabled) |

8. **Stop transmitting** by clicking **■ Stop** in the app, then click **Disconnect** in Postman when done.

> **Tip:** Increase the transmission interval (e.g. 2 s) while inspecting frames in Postman — it gives more time to read each message before the next one arrives.

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
        ├── cadu.ts
        ├── cadu.test.ts
        ├── crc.ts
        ├── crc.test.ts
        ├── frameBuilder.ts
        ├── frameBuilder.test.ts
        ├── hex.ts
        ├── hex.test.ts
        ├── reedSolomon.ts
        └── reedSolomon.test.ts
```

---

## License

MIT
