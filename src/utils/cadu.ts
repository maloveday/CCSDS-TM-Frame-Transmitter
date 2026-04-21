/**
 * CCSDS Channel Access Data Unit (CADU) builder.
 * Reference: CCSDS 131.0-B-5 (TM Synchronization and Channel Coding)
 *
 * CADU structure:
 *   [ASM 4 bytes] [Transfer Frame (optionally pseudo-randomized)]
 *
 * Attached Synchronization Marker (ASM):
 *   0x1A 0xCF 0xFC 0x1D  — used for uncoded, convolutional, Reed-Solomon,
 *   concatenated, and rate-7/8 LDPC coded data (Table 2-1).
 *
 * Pseudo-randomization (optional, CCSDS 131.0-B-5 §9.1):
 *   Fibonacci LFSR, generator polynomial h(x) = x^8 + x^7 + x^5 + x^3 + 1,
 *   initial fill all-ones (0xFF), 255-bit period.
 *   The sequence is XOR'd with the Transfer Frame only (ASM is not randomized).
 */

import type { FrameSection } from '../types';

export const ASM = new Uint8Array([0x1a, 0xcf, 0xfc, 0x1d]);
export const ASM_SIZE = 4;

export interface CADUResult {
  cadu: Uint8Array;
  sections: FrameSection[];
}

/**
 * Wrap a Transfer Frame in a CADU.
 *
 * @param frame          - Completed TM Transfer Frame bytes.
 * @param randomize      - Apply CCSDS PRBS pseudo-randomization to the frame.
 * @param frameSections  - Section annotations from buildTMFrame (offset by ASM_SIZE).
 */
export function buildCADU(
  frame: Uint8Array,
  randomize: boolean,
  frameSections: FrameSection[] = [],
): CADUResult {
  const cadu = new Uint8Array(ASM_SIZE + frame.length);
  cadu.set(ASM, 0);
  cadu.set(randomize ? applyPRBS(frame) : frame, ASM_SIZE);

  const sections: FrameSection[] = [
    {
      label: 'ASM',
      start: 0,
      end: ASM_SIZE,
      color: 'bg-orange-900/60',
      textColor: 'text-orange-300',
    },
    ...frameSections.map(s => ({
      ...s,
      start: s.start + ASM_SIZE,
      end: s.end + ASM_SIZE,
    })),
  ];

  return { cadu, sections };
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
