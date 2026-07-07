# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Vite dev server (hot-reload) on http://localhost:5173
npm run build        # tsc -b (type-check all projects) then vite build → dist/
npm run lint         # ESLint across all source files
npm test             # Vitest run (single pass)
npm run test:watch   # Vitest in watch mode
npm run test:coverage # Coverage report in ./coverage/

# Run a single test file
npx vitest run src/utils/reedSolomon.test.ts

# Docker (production image + WebSocket echo server)
docker compose up --build
```

The build uses TypeScript project references (`tsconfig.json` → `tsconfig.app.json` + `tsconfig.node.json`). Vitest has its own config (`vitest.config.ts`) so that `vite.config.ts` stays free of Vitest types and `tsc -b` succeeds. The two configs must stay separate — do not add a `test` block to `vite.config.ts`.

`tsconfig.app.json` enforces `noUnusedLocals` and `noUnusedParameters`; unused imports will fail the Docker build.

## Architecture

### Data flow (single frame)

```
FrameConfig + payload bytes
      │
      ▼
buildTMFrame()          → BuildResult { frame, sections, error }
      │
      ▼  (when hasCADU)
buildCADU()             → CADUResult  { cadu, sections, error }
      │
      ▼
WebSocket.send(buffer)
```

`buildTMFrame` (`src/utils/frameBuilder.ts`) assembles the 6-byte primary header, optional secondary header, data field (payload + idle fill), optional OCF, and optional FECF (CRC-16/CCITT-FALSE from `crc.ts`). It returns colour-coded `FrameSection[]` that the hex-dump preview uses directly.

`buildCADU` (`src/utils/cadu.ts`) prepends the 4-byte ASM (`1A CF FC 1D`) and, depending on `caduPayloadType`, either passes the Transfer Frame through, RS-encodes it (`reedSolomon.ts`), or substitutes raw codeword bytes. It offsets the incoming `FrameSection[]` by `ASM_SIZE` so the preview annotations remain correct.

### State and hooks

All transmission state lives in `useTransmitter` (`src/hooks/useTransmitter.ts`). `start()` accepts a `getPayload: () => Promise<Uint8Array>` callback rather than a static byte array — this supports the folder-rotation feature where each frame reads a fresh file from disk. The callback is captured in the WebSocket `onopen` closure; controls are disabled while running so the closure is stable. An `sendInProgress` flag prevents concurrent async invocations when a file read outlasts the interval.

`App.tsx` owns all top-level state and wires everything together:
- `frameConfig` / `txConfig` / `payload` — standard form state
- `folderPayload` — folder rotation state (`FolderPayloadState`)
- `folderIndexRef` — `useRef` tracking the next file index (avoids stale closure issues); resets to 0 on every `start()` call
- `previewResult` / `displayResult` — `useMemo` chains that rebuild the preview frame on every config or payload change; `displayFrame` only uses `lastFrame` while `isRunning` to preserve live-preview reactivity after transmission stops

### Types (`src/types.ts`)

`FrameConfig` is the single source of truth for all frame and CADU parameters passed to both the builder and the UI. `FolderPayloadState` holds the sorted `File[]` array — files are never pre-read; `file.text()` is called on each send to read fresh content.

### Tests

Vitest discovers files matching `src/**/*.test.ts`. The default environment is `node`; `useTransmitter.test.ts` opts into jsdom with a `// @vitest-environment jsdom` pragma and drives the hook via `@testing-library/react` `renderHook` with a mock `WebSocket` class and fake timers.

| Suite | What it tests |
|---|---|
| `crc.test.ts` | CRC-16/CCITT-FALSE, known check vector 0x29B1 |
| `hex.test.ts` | `hexToBytes`, `bytesToHex`, `asciiToBytes`, `hexDump`, `validateHexInput` |
| `frameBuilder.test.ts` | Full frame assembly, header bit layout, optional fields, `availableDataBytes` |
| `cadu.test.ts` | ASM value, transfer-frame / RS / codeword payload types, PRBS known-answer vector + period |
| `reedSolomon.test.ts` | GF(2⁸) tables, generator polynomial roots, systematic encoding, syndrome validation, interleaving, table-free cross-validation |
| `folderPayload.test.ts` | File ordering, top-level filtering, rotation semantics, fresh reads |
| `useTransmitter.test.ts` | Connection lifecycle, error propagation, interval sending, async payload guards |
| `integration.test.ts` | Byte-exact golden vector through frame → CADU → PRBS |

When changing an encoder, prefer validating against an *independent* reference (published CCSDS vectors, or a structurally different reimplementation in the test) rather than vectors generated from the implementation under test — implementation-derived vectors once masked a real PRBS tap bug (`FF 5A EA B2` instead of the standard's `FF 48 0E C0 9A`).

### CCSDS references

- **CCSDS 132.0-B-3** — TM Transfer Frame (primary header layout, FHP sentinels, FECF)
- **CCSDS 131.0-B-5** — TM Synchronization and Channel Coding (ASM value, RS code parameters, PRBS LFSR)

RS parameters: GF(2⁸) primitive polynomial `0x187`, FCR=112, α=0x02. RS(255,223): 2t=32; RS(255,239): 2t=16.
