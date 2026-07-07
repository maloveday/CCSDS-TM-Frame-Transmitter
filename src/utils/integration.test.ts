import { describe, it, expect } from 'vitest';
import { buildTMFrame } from './frameBuilder';
import { buildCADU, ASM_SIZE } from './cadu';
import type { FrameConfig } from '../types';

/**
 * End-to-end golden vector.
 *
 * One fully-loaded configuration exercised through the whole pipeline
 * (primary header + secondary header + payload + idle fill + OCF + FECF,
 * then CADU encapsulation with PRBS), asserted byte-for-byte.
 *
 * This guards the integration seams that per-module tests can't see:
 * field ordering, section offsets, and the order in which encodings are
 * applied. If this test fails and a module test doesn't, the regression
 * is in how the layers compose.
 */

const CONFIG: FrameConfig = {
  scid: 42,
  vcid: 3,
  hasOCF: true,
  syncFlag: true,
  packetOrderFlag: false,
  segmentLengthId: 3,
  firstHeaderPointer: 0,
  frameLength: 24,
  hasSecondaryHeader: true,
  secondaryHeaderData: 'CAFE',
  ocfData: 'DEADBEEF',
  hasFECF: true,
  idleFillByte: 0xe0,
  hasCADU: true,
  caduRandomize: true,
  caduPayloadType: 'transfer-frame',
  rsVariant: 'RS_255_223',
  rsInterleaveDepth: 1,
  caduCodewordData: '',
};

const PAYLOAD = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);
const MCFC = 7;
const VCFC = 200;

// Expected Transfer Frame, derived field-by-field:
//   word01 = SCID 42 << 4 | VCID 3 << 1 | OCF 1     = 0x02A7
//   MCFC=7, VCFC=200
//   word45 = SH 1<<15 | sync 1<<14 | seg 3<<11 | FHP 0 = 0xD800
//   SH: ID byte 0x02 (2 data bytes) + CA FE
//   data field (9B) = payload 01..05 + idle E0 ×4
//   OCF = DE AD BE EF, FECF = CRC-16/CCITT-FALSE over all preceding bytes
const EXPECTED_FRAME = new Uint8Array([
  0x02, 0xa7, 0x07, 0xc8, 0xd8, 0x00,             // primary header
  0x02, 0xca, 0xfe,                                // secondary header
  0x01, 0x02, 0x03, 0x04, 0x05, 0xe0, 0xe0, 0xe0, 0xe0, // data field
  0xde, 0xad, 0xbe, 0xef,                          // OCF
  0x4c, 0x71,                                      // FECF
]);

// Expected CADU = ASM + (frame XOR CCSDS PRBS mask FF 48 0E C0 9A ...)
const EXPECTED_CADU = new Uint8Array([
  0x1a, 0xcf, 0xfc, 0x1d,
  0xfd, 0xef, 0x09, 0x08, 0x42, 0x0d, 0x72, 0x76, 0x70, 0x2d,
  0x91, 0xae, 0xa3, 0xb2, 0xa6, 0x2e, 0xba, 0x77, 0xa3, 0x61,
  0x8c, 0x4d, 0xf3, 0x4f,
]);

describe('end-to-end golden vector', () => {
  it('builds the exact Transfer Frame bytes', () => {
    const { frame, error } = buildTMFrame(CONFIG, PAYLOAD, MCFC, VCFC);
    expect(error).toBeNull();
    expect(frame).toEqual(EXPECTED_FRAME);
  });

  it('builds the exact CADU bytes (ASM + PRBS-randomized frame)', () => {
    const built = buildTMFrame(CONFIG, PAYLOAD, MCFC, VCFC);
    const { cadu, error } = buildCADU(built.frame, CONFIG, built.sections);
    expect(error).toBeNull();
    expect(cadu).toEqual(EXPECTED_CADU);
  });

  it('first CADU payload bytes XOR back to the frame with the published PRBS mask', () => {
    // Cross-check the two golden vectors against each other and the
    // independently published CCSDS mask FF 48 0E C0 9A.
    const mask = [0xff, 0x48, 0x0e, 0xc0, 0x9a];
    for (let i = 0; i < mask.length; i++) {
      expect(EXPECTED_CADU[ASM_SIZE + i] ^ mask[i]).toBe(EXPECTED_FRAME[i]);
    }
  });

  it('section annotations tile the CADU exactly', () => {
    const built = buildTMFrame(CONFIG, PAYLOAD, MCFC, VCFC);
    const { cadu, sections } = buildCADU(built.frame, CONFIG, built.sections);
    expect(sections[0].start).toBe(0);
    expect(sections[sections.length - 1].end).toBe(cadu.length);
    for (let i = 1; i < sections.length; i++) {
      expect(sections[i].start).toBe(sections[i - 1].end);
    }
  });
});
