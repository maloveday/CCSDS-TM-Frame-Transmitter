import { describe, it, expect } from 'vitest';
import { buildTMFrame, availableDataBytes, FHP_IDLE, FHP_NO_PACKET } from './frameBuilder';
import type { FrameConfig } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid FrameConfig – no optional fields. */
function makeConfig(overrides: Partial<FrameConfig> = {}): FrameConfig {
  return {
    scid: 0,
    vcid: 0,
    hasOCF: false,
    syncFlag: false,
    packetOrderFlag: false,
    segmentLengthId: 3,
    firstHeaderPointer: FHP_NO_PACKET,
    frameLength: 7,
    hasSecondaryHeader: false,
    secondaryHeaderData: '',
    ocfData: '',
    hasFECF: false,
    idleFillByte: 0xe0,
    hasCADU: false,
    caduRandomize: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildTMFrame – basic structure
// ---------------------------------------------------------------------------

describe('buildTMFrame – basic structure', () => {
  it('builds a minimal 7-byte frame with correct header bytes', () => {
    const cfg = makeConfig();
    const { frame, error } = buildTMFrame(cfg, new Uint8Array(0), 0, 0);

    expect(error).toBeNull();
    expect(frame.length).toBe(7);
    // Primary header: word01 = 0x0000, mcfc=0x00, vcfc=0x00, word45=0x1FFF
    expect(frame[0]).toBe(0x00);
    expect(frame[1]).toBe(0x00);
    expect(frame[2]).toBe(0x00); // MCFC
    expect(frame[3]).toBe(0x00); // VCFC
    expect(frame[4]).toBe(0x1f);
    expect(frame[5]).toBe(0xff);
    // Data field byte: idle fill
    expect(frame[6]).toBe(0xe0);
  });

  it('encodes SCID and VCID in the primary header', () => {
    const cfg = makeConfig({ scid: 42, vcid: 3, frameLength: 7 });
    const { frame, error } = buildTMFrame(cfg, new Uint8Array(0), 0, 0);

    expect(error).toBeNull();
    // word01 = (42 << 4) | (3 << 1) = 0x02A6
    expect(frame[0]).toBe(0x02);
    expect(frame[1]).toBe(0xa6);
  });

  it('encodes MCFC and VCFC counters', () => {
    const cfg = makeConfig({ frameLength: 7 });
    const { frame, error } = buildTMFrame(cfg, new Uint8Array(0), 200, 123);

    expect(error).toBeNull();
    expect(frame[2]).toBe(200); // MCFC
    expect(frame[3]).toBe(123); // VCFC
  });

  it('wraps MCFC/VCFC at 255 (8-bit mask)', () => {
    const cfg = makeConfig({ frameLength: 7 });
    const { frame } = buildTMFrame(cfg, new Uint8Array(0), 256, 257);

    expect(frame[2]).toBe(0); // 256 & 0xFF
    expect(frame[3]).toBe(1); // 257 & 0xFF
  });

  it('fills data field with idle byte when payload is empty', () => {
    const cfg = makeConfig({ frameLength: 10, idleFillByte: 0xaa });
    const { frame, idleBytesUsed } = buildTMFrame(cfg, new Uint8Array(0), 0, 0);

    expect(idleBytesUsed).toBe(4); // 10 - 6 = 4 data bytes
    for (let i = 6; i < 10; i++) {
      expect(frame[i]).toBe(0xaa);
    }
  });

  it('places payload at the start of the data field', () => {
    const cfg = makeConfig({ frameLength: 10 });
    const payload = new Uint8Array([0x01, 0x02, 0x03]);
    const { frame, payloadBytesUsed, idleBytesUsed } = buildTMFrame(cfg, payload, 0, 0);

    expect(payloadBytesUsed).toBe(3);
    expect(idleBytesUsed).toBe(1);
    expect(frame[6]).toBe(0x01);
    expect(frame[7]).toBe(0x02);
    expect(frame[8]).toBe(0x03);
    expect(frame[9]).toBe(0xe0); // idle fill
  });

  it('truncates payload to fit the data field', () => {
    const cfg = makeConfig({ frameLength: 8 }); // 2 data bytes
    const payload = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);
    const { payloadBytesUsed, idleBytesUsed } = buildTMFrame(cfg, payload, 0, 0);

    expect(payloadBytesUsed).toBe(2);
    expect(idleBytesUsed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildTMFrame – validation errors
// ---------------------------------------------------------------------------

describe('buildTMFrame – validation errors', () => {
  it('rejects a frame length below 7', () => {
    const { error } = buildTMFrame(makeConfig({ frameLength: 6 }), new Uint8Array(0), 0, 0);
    expect(error).not.toBeNull();
    expect(error).toMatch(/7/);
  });

  it('rejects a frame length above 2048', () => {
    const { error } = buildTMFrame(makeConfig({ frameLength: 2049 }), new Uint8Array(0), 0, 0);
    expect(error).not.toBeNull();
  });

  it('rejects when options leave no room for the data field', () => {
    // 7-byte frame + OCF(4) + FECF(2) → overhead=12, data=-5 → invalid
    const cfg = makeConfig({ frameLength: 7, hasOCF: true, hasFECF: true });
    const { error } = buildTMFrame(cfg, new Uint8Array(0), 0, 0);
    expect(error).not.toBeNull();
    expect(error).toMatch(/too small/i);
  });

  it('rejects invalid secondary header hex data', () => {
    const cfg = makeConfig({
      frameLength: 20,
      hasSecondaryHeader: true,
      secondaryHeaderData: 'zzzz',
    });
    const { error } = buildTMFrame(cfg, new Uint8Array(0), 0, 0);
    expect(error).not.toBeNull();
    expect(error).toMatch(/secondary header/i);
  });

  it('returns an error object and an empty frame on failure', () => {
    const { frame, sections, error } = buildTMFrame(
      makeConfig({ frameLength: 0 }),
      new Uint8Array(0),
      0,
      0,
    );
    expect(error).not.toBeNull();
    expect(frame.length).toBe(0);
    expect(sections.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildTMFrame – optional fields
// ---------------------------------------------------------------------------

describe('buildTMFrame – FECF', () => {
  it('appends a 2-byte CRC when hasFECF is true', () => {
    // frameLength=9: 6 header + 1 data + 2 FECF
    const cfg = makeConfig({ frameLength: 9, hasFECF: true });
    const { frame, error } = buildTMFrame(cfg, new Uint8Array(0), 0, 0);

    expect(error).toBeNull();
    expect(frame.length).toBe(9);
    // Pre-computed FECF for this frame: 0x604D
    expect(frame[7]).toBe(0x60);
    expect(frame[8]).toBe(0x4d);
  });

  it('includes a FECF section in the sections array', () => {
    const cfg = makeConfig({ frameLength: 9, hasFECF: true });
    const { sections } = buildTMFrame(cfg, new Uint8Array(0), 0, 0);
    const fecfSection = sections.find(s => s.label === 'FECF');
    expect(fecfSection).toBeDefined();
    expect(fecfSection!.end - fecfSection!.start).toBe(2);
  });
});

describe('buildTMFrame – OCF', () => {
  it('inserts a 4-byte OCF field before FECF', () => {
    // frameLength=11: 6 header + 1 data + 4 OCF
    const cfg = makeConfig({ frameLength: 11, hasOCF: true, ocfData: 'AABBCCDD' });
    const { frame, error } = buildTMFrame(cfg, new Uint8Array(0), 0, 0);

    expect(error).toBeNull();
    expect(frame.length).toBe(11);
    expect(frame[7]).toBe(0xaa);
    expect(frame[8]).toBe(0xbb);
    expect(frame[9]).toBe(0xcc);
    expect(frame[10]).toBe(0xdd);
  });

  it('sets the OCF flag bit in the primary header', () => {
    const cfg = makeConfig({ frameLength: 11, hasOCF: true });
    const { frame } = buildTMFrame(cfg, new Uint8Array(0), 0, 0);
    // Bit 0 of byte 1 is the OCF flag
    expect(frame[1] & 0x01).toBe(1);
  });

  it('includes an OCF section in the sections array', () => {
    const cfg = makeConfig({ frameLength: 11, hasOCF: true });
    const { sections } = buildTMFrame(cfg, new Uint8Array(0), 0, 0);
    const ocfSection = sections.find(s => s.label === 'OCF');
    expect(ocfSection).toBeDefined();
    expect(ocfSection!.end - ocfSection!.start).toBe(4);
  });
});

describe('buildTMFrame – Secondary Header', () => {
  it('inserts a secondary header with the correct ID byte', () => {
    // frameLength=12: 6 PH + (1 SH_ID + 4 SH_data) + 1 data
    const cfg = makeConfig({
      frameLength: 12,
      hasSecondaryHeader: true,
      secondaryHeaderData: 'AABBCCDD', // 4 bytes
    });
    const { frame, error } = buildTMFrame(cfg, new Uint8Array(0), 0, 0);

    expect(error).toBeNull();
    // SH ID byte: bits [7:6]=00, bits [5:0]=data length (4)
    expect(frame[6]).toBe(0x04);
    // SH data bytes
    expect(frame[7]).toBe(0xaa);
    expect(frame[8]).toBe(0xbb);
    expect(frame[9]).toBe(0xcc);
    expect(frame[10]).toBe(0xdd);
  });

  it('sets the secondary header flag in the primary header', () => {
    const cfg = makeConfig({
      frameLength: 12,
      hasSecondaryHeader: true,
      secondaryHeaderData: 'AABBCCDD',
    });
    const { frame } = buildTMFrame(cfg, new Uint8Array(0), 0, 0);
    // Bit 15 of word45 (byte 4, bit 7)
    expect(frame[4] & 0x80).toBe(0x80);
  });

  it('includes a Secondary Header section in sections array', () => {
    const cfg = makeConfig({
      frameLength: 12,
      hasSecondaryHeader: true,
      secondaryHeaderData: 'AABBCCDD',
    });
    const { sections } = buildTMFrame(cfg, new Uint8Array(0), 0, 0);
    const shSection = sections.find(s => s.label === 'Secondary Header');
    expect(shSection).toBeDefined();
    expect(shSection!.end - shSection!.start).toBe(5); // 1 ID + 4 data
  });
});

// ---------------------------------------------------------------------------
// buildTMFrame – sections
// ---------------------------------------------------------------------------

describe('buildTMFrame – sections', () => {
  it('always includes a Primary Header section spanning bytes 0–6', () => {
    const { sections } = buildTMFrame(makeConfig({ frameLength: 7 }), new Uint8Array(0), 0, 0);
    const ph = sections.find(s => s.label === 'Primary Header');
    expect(ph).toBeDefined();
    expect(ph!.start).toBe(0);
    expect(ph!.end).toBe(6);
  });

  it('always includes a Data Field section', () => {
    const { sections } = buildTMFrame(makeConfig({ frameLength: 10 }), new Uint8Array(0), 0, 0);
    const df = sections.find(s => s.label === 'Data Field');
    expect(df).toBeDefined();
    expect(df!.end - df!.start).toBe(4); // 10 - 6
  });

  it('section boundaries are contiguous (no gaps or overlaps)', () => {
    const cfg = makeConfig({
      frameLength: 20,
      hasOCF: true,
      hasFECF: true,
      hasSecondaryHeader: true,
      secondaryHeaderData: 'AABB',
    });
    const { sections, frame } = buildTMFrame(cfg, new Uint8Array(0), 0, 0);
    expect(sections[0].start).toBe(0);
    expect(sections[sections.length - 1].end).toBe(frame.length);
    for (let i = 1; i < sections.length; i++) {
      expect(sections[i].start).toBe(sections[i - 1].end);
    }
  });
});

// ---------------------------------------------------------------------------
// buildTMFrame – FHP sentinel values
// ---------------------------------------------------------------------------

describe('buildTMFrame – FHP sentinel constants', () => {
  it('FHP_IDLE is 0x7FE', () => {
    expect(FHP_IDLE).toBe(0x7fe);
  });

  it('FHP_NO_PACKET is 0x7FF', () => {
    expect(FHP_NO_PACKET).toBe(0x7ff);
  });

  it('encodes FHP_IDLE in the primary header', () => {
    const cfg = makeConfig({ frameLength: 7, firstHeaderPointer: FHP_IDLE });
    const { frame } = buildTMFrame(cfg, new Uint8Array(0), 0, 0);
    // word45 bits [10:0] = FHP
    const word45 = (frame[4] << 8) | frame[5];
    expect(word45 & 0x7ff).toBe(FHP_IDLE);
  });
});

// ---------------------------------------------------------------------------
// availableDataBytes
// ---------------------------------------------------------------------------

describe('availableDataBytes', () => {
  it('returns frameLength minus 6 with no optional fields', () => {
    const cfg = makeConfig({ frameLength: 128 });
    expect(availableDataBytes(cfg)).toBe(122);
  });

  it('subtracts 2 bytes for FECF', () => {
    const cfg = makeConfig({ frameLength: 128, hasFECF: true });
    expect(availableDataBytes(cfg)).toBe(120);
  });

  it('subtracts 4 bytes for OCF', () => {
    const cfg = makeConfig({ frameLength: 128, hasOCF: true });
    expect(availableDataBytes(cfg)).toBe(118);
  });

  it('subtracts 1 + SH data bytes for secondary header', () => {
    // 4 hex bytes = 2 SH data bytes
    const cfg = makeConfig({
      frameLength: 128,
      hasSecondaryHeader: true,
      secondaryHeaderData: 'AABB', // 2 bytes
    });
    expect(availableDataBytes(cfg)).toBe(119); // 128 - 6 - 1 - 2
  });

  it('accounts for all optional fields combined', () => {
    const cfg = makeConfig({
      frameLength: 128,
      hasFECF: true,
      hasOCF: true,
      hasSecondaryHeader: true,
      secondaryHeaderData: 'AABBCCDD', // 4 bytes
    });
    expect(availableDataBytes(cfg)).toBe(111); // 128 - 6 - 2 - 4 - 1 - 4
  });

  it('returns 0 and does not go negative when frame is too small for options', () => {
    const cfg = makeConfig({ frameLength: 7, hasFECF: true, hasOCF: true });
    expect(availableDataBytes(cfg)).toBe(0);
  });

  it('caps secondary header data at 63 bytes', () => {
    // 126 hex chars = 63 bytes (the maximum SH data length)
    const cfg = makeConfig({
      frameLength: 200,
      hasSecondaryHeader: true,
      secondaryHeaderData: 'AA'.repeat(64), // 64 bytes → capped to 63
    });
    expect(availableDataBytes(cfg)).toBe(200 - 6 - 1 - 63); // 130
  });
});
