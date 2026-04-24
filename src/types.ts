// CCSDS TM Transfer Frame configuration (CCSDS 132.0-B-3)
export interface FrameConfig {
  // Primary Header fields
  scid: number;              // Spacecraft ID: 10 bits, 0–1023
  vcid: number;              // Virtual Channel ID: 3 bits, 0–7
  hasOCF: boolean;           // Operational Control Field flag
  syncFlag: boolean;         // Synchronization Flag (1 = byte-stream, 0 = packet)
  packetOrderFlag: boolean;  // Packet Order Flag (only meaningful when syncFlag=0)
  segmentLengthId: number;   // Segment Length Identifier: 2 bits (0–3), 3=unsegmented
  firstHeaderPointer: number;// First Header Pointer: 11 bits (0x7FF = no packet, 0x7FE = idle)

  // Frame structure
  frameLength: number;       // Total frame length in bytes, 7–2048

  // Secondary Header
  hasSecondaryHeader: boolean;
  secondaryHeaderData: string; // hex string for secondary header data (1–63 bytes)

  // Operational Control Field (4 bytes if hasOCF)
  ocfData: string; // hex string, exactly 4 bytes

  // Frame Error Control Field
  hasFECF: boolean; // append CRC-16 CCITT

  // Idle fill byte (used when payload < data field capacity)
  idleFillByte: number; // default 0xE0

  // CADU encapsulation (CCSDS 131.0-B-5)
  hasCADU: boolean;        // prepend 4-byte ASM (0x1A CF FC 1D)
  caduRandomize: boolean;  // apply PRBS pseudo-randomization to the Transfer Frame
  caduPayloadType: CaduPayloadType;    // what fills the CADU payload
  rsVariant: RsVariant;                // RS code variant (only when caduPayloadType='reed-solomon')
  rsInterleaveDepth: RsInterleaveDepth;// RS interleave depth I (1, 2, 3, 4, 5, or 8)
  caduCodewordData: string;            // hex string for raw codeword (only when caduPayloadType='codeword')
}

/** What bytes fill the CADU payload (after the ASM). */
export type CaduPayloadType = 'transfer-frame' | 'reed-solomon' | 'codeword';

/** CCSDS RS code variant (CCSDS 131.0-B-5 §4). */
export type RsVariant = 'RS_255_223' | 'RS_255_239';

/** RS interleave depth (number of independently encoded sub-blocks). */
export type RsInterleaveDepth = 1 | 2 | 3 | 4 | 5 | 8;

export type PayloadMode = 'hex' | 'ascii';

export interface PayloadState {
  mode: PayloadMode;
  text: string;        // raw input text (hex pairs or ascii)
  bytes: Uint8Array;   // parsed bytes
  error: string | null;
  fileName: string | null;
}

/** Rotating folder payload source — files are read fresh on every use. */
export interface FolderPayloadState {
  enabled: boolean;
  dirName: string | null;
  /** Sorted alphanumerically; each file contains hex-encoded payload bytes. */
  files: File[];
  /** Index of the file that was last sent (for UI display). */
  currentIndex: number;
  error: string | null;
}

export type WsStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface TransmissionConfig {
  wsUrl: string;
  intervalMs: number; // milliseconds between frames
}

export interface TransmissionStats {
  framesSent: number;
  bytesSent: number;
  mcfc: number;        // Master Channel Frame Count (0–255, wraps)
  vcfc: number;        // Virtual Channel Frame Count (0–255, wraps)
  lastFrameTs: number | null;
}

export interface FrameSection {
  label: string;
  start: number; // byte offset
  end: number;   // exclusive
  color: string; // tailwind bg color class
  textColor: string;
}
