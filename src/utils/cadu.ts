/**
 * CCSDS Channel Access Data Unit (CADU) builder.
 * Reference: CCSDS 131.0-B-5 (TM Synchronization and Channel Coding)
 *
 * CADU structure:
 *   [ASM 4 bytes] [Payload]
 *
 * Payload options (caduPayloadType):
 *   'transfer-frame' — Transfer Frame bytes (optionally PRBS-randomized)
 *   'reed-solomon'   — RS-encoded Transfer Frame (RS(255,223) or RS(255,239),
 *                      with configurable interleave depth; optionally PRBS-randomized)
 *   'codeword'       — User-supplied raw codeword bytes (hex input)
 *
 * Attached Synchronization Marker (ASM):
 *   0x1A 0xCF 0xFC 0x1D  — Table 2-1, CCSDS 131.0-B-5
 *
 * Pseudo-randomization (CCSDS 131.0-B-5 §9.1):
 *   Fibonacci LFSR, h(x) = x^8+x^7+x^5+x^3+1, seed 0xFF, 255-bit period.
 *   Applied to the payload bytes only (ASM is never randomized).
 */

import type { FrameSection, CaduPayloadType, RsVariant, RsInterleaveDepth } from '../types';
import { rsEncode, RS_VARIANT_INFO } from './reedSolomon';
import { hexToBytes } from './hex';

export const ASM = new Uint8Array([0x1a, 0xcf, 0xfc, 0x1d]);
export const ASM_SIZE = 4;

export interface CADUResult {
  cadu: Uint8Array;
  sections: FrameSection[];
  error: string | null;
}

export interface CADUConfig {
  caduRandomize: boolean;
  caduPayloadType: CaduPayloadType;
  rsVariant: RsVariant;
  rsInterleaveDepth: RsInterleaveDepth;
  caduCodewordData: string;
}

/**
 * Assemble a CADU from a completed TM Transfer Frame.
 *
 * @param frame         - Completed TM Transfer Frame bytes.
 * @param config        - CADU configuration (payload type, RS params, randomize flag).
 * @param frameSections - Section annotations from buildTMFrame (offset by ASM_SIZE when
 *                        payload type is 'transfer-frame').
 */
export function buildCADU(
  frame: Uint8Array,
  config: CADUConfig,
  frameSections: FrameSection[] = [],
): CADUResult {
  const { caduRandomize, caduPayloadType, rsVariant, rsInterleaveDepth, caduCodewordData } = config;

  let payload: Uint8Array;
  let payloadSections: FrameSection[];
  let error: string | null = null;

  // Build the payload bytes and associated sections
  switch (caduPayloadType) {
    case 'transfer-frame': {
      payload = frame;
      payloadSections = frameSections.map(s => ({
        ...s,
        start: s.start + ASM_SIZE,
        end: s.end + ASM_SIZE,
      }));
      break;
    }

    case 'reed-solomon': {
      const info = RS_VARIANT_INFO[rsVariant];
      const rsPayload = rsEncode(frame, rsVariant, rsInterleaveDepth);
      payload = rsPayload;

      // Sections: one "Data" section per sub-block + one "RS Check" section per sub-block
      // For depth > 1 the data is interleaved so we just annotate the full RS block.
      const I = rsInterleaveDepth;
      const rsDataBytes = info.k * I;    // data portion of RS payload
      const rsSections: FrameSection[] = [
        {
          label: `RS Data (${I === 1 ? info.k : `${info.k}×${I}`}B)`,
          start: ASM_SIZE,
          end: ASM_SIZE + rsDataBytes,
          color: 'bg-green-900/60',
          textColor: 'text-green-300',
        },
        {
          label: `RS Check (${info.twoT * I}B)`,
          start: ASM_SIZE + rsDataBytes,
          end: ASM_SIZE + rsPayload.length,
          color: 'bg-pink-900/60',
          textColor: 'text-pink-300',
        },
      ];
      payloadSections = rsSections;
      break;
    }

    case 'codeword': {
      const parsed = caduCodewordData.trim() ? hexToBytes(caduCodewordData) : new Uint8Array(0);
      if (parsed === null) {
        error = 'Codeword: invalid hex data';
        payload = new Uint8Array(0);
      } else {
        payload = parsed;
      }
      payloadSections = payload.length > 0
        ? [{
            label: 'Codeword',
            start: ASM_SIZE,
            end: ASM_SIZE + payload.length,
            color: 'bg-teal-900/60',
            textColor: 'text-teal-300',
          }]
        : [];
      break;
    }
  }

  if (error) {
    return { cadu: new Uint8Array(0), sections: [], error };
  }

  const processedPayload = caduRandomize ? applyPRBS(payload) : payload;
  const cadu = new Uint8Array(ASM_SIZE + processedPayload.length);
  cadu.set(ASM, 0);
  cadu.set(processedPayload, ASM_SIZE);

  const sections: FrameSection[] = [
    {
      label: 'ASM',
      start: 0,
      end: ASM_SIZE,
      color: 'bg-orange-900/60',
      textColor: 'text-orange-300',
    },
    ...payloadSections,
  ];

  return { cadu, sections, error: null };
}

/**
 * CCSDS PRBS pseudo-randomizer (CCSDS 131.0-B-5 §9.1 / Annex A).
 *
 * Fibonacci LFSR: h(x) = x^8 + x^7 + x^5 + x^3 + 1, seed = 0xFF.
 * Shift-left register, MSB output, feedback taps at bit positions 7, 5, 3, 0.
 * XOR output sequence with data bytes (self-inverse operation).
 */
export function applyPRBS(data: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length);
  let reg = 0xff;

  for (let i = 0; i < data.length; i++) {
    let mask = 0;
    for (let bit = 7; bit >= 0; bit--) {
      const out = (reg >> 7) & 1;
      mask |= out << bit;
      const fb = ((reg >> 7) ^ (reg >> 5) ^ (reg >> 3) ^ reg) & 1;
      reg = ((reg << 1) | fb) & 0xff;
    }
    result[i] = data[i] ^ mask;
  }

  return result;
}
