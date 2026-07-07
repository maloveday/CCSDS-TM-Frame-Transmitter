import { describe, it, expect } from 'vitest';
import { ASM, ASM_SIZE, buildCADU, applyPRBS } from './cadu';
import type { CADUConfig } from './cadu';

// Default config for transfer-frame tests (matches old test API)
const TF_CONFIG: CADUConfig = {
  caduRandomize: false,
  caduPayloadType: 'transfer-frame',
  rsVariant: 'RS_255_223',
  rsInterleaveDepth: 1,
  caduCodewordData: '',
};

const TF_CONFIG_PRBS: CADUConfig = { ...TF_CONFIG, caduRandomize: true };

// ---------------------------------------------------------------------------
// ASM constant
// ---------------------------------------------------------------------------

describe('ASM', () => {
  it('is 4 bytes', () => {
    expect(ASM.length).toBe(4);
    expect(ASM_SIZE).toBe(4);
  });

  it('equals 0x1A CF FC 1D per CCSDS 131.0-B-5', () => {
    expect(ASM[0]).toBe(0x1a);
    expect(ASM[1]).toBe(0xcf);
    expect(ASM[2]).toBe(0xfc);
    expect(ASM[3]).toBe(0x1d);
  });
});

// ---------------------------------------------------------------------------
// buildCADU — structure (transfer-frame payload)
// ---------------------------------------------------------------------------

describe('buildCADU – structure', () => {
  it('output length equals ASM_SIZE + frame.length', () => {
    const frame = new Uint8Array(7).fill(0x00);
    const { cadu } = buildCADU(frame, TF_CONFIG);
    expect(cadu.length).toBe(ASM_SIZE + 7);
  });

  it('first 4 bytes are always the ASM', () => {
    const frame = new Uint8Array(16).fill(0xaa);
    const { cadu } = buildCADU(frame, TF_CONFIG);
    expect(cadu[0]).toBe(0x1a);
    expect(cadu[1]).toBe(0xcf);
    expect(cadu[2]).toBe(0xfc);
    expect(cadu[3]).toBe(0x1d);
  });

  it('without randomization: frame bytes follow ASM unchanged', () => {
    const frame = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    const { cadu } = buildCADU(frame, TF_CONFIG);
    expect(cadu[4]).toBe(0x01);
    expect(cadu[5]).toBe(0x02);
    expect(cadu[6]).toBe(0x03);
    expect(cadu[7]).toBe(0x04);
  });

  it('with randomization: ASM bytes are still unmodified', () => {
    const frame = new Uint8Array(8).fill(0xff);
    const { cadu } = buildCADU(frame, TF_CONFIG_PRBS);
    expect(cadu[0]).toBe(0x1a);
    expect(cadu[1]).toBe(0xcf);
    expect(cadu[2]).toBe(0xfc);
    expect(cadu[3]).toBe(0x1d);
  });

  it('with randomization: frame bytes differ from original', () => {
    const frame = new Uint8Array(8).fill(0x00);
    const { cadu } = buildCADU(frame, TF_CONFIG_PRBS);
    // PRBS applied to all-zeros gives the PRBS mask itself — must differ from 0x00
    const frameBytes = cadu.slice(ASM_SIZE);
    const allZero = frameBytes.every(b => b === 0x00);
    expect(allZero).toBe(false);
  });

  it('error is null for valid transfer-frame payload', () => {
    const { error } = buildCADU(new Uint8Array(8), TF_CONFIG);
    expect(error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildCADU — sections (transfer-frame)
// ---------------------------------------------------------------------------

describe('buildCADU – sections', () => {
  it('first section is the ASM, spanning bytes 0–4', () => {
    const { sections } = buildCADU(new Uint8Array(8), TF_CONFIG);
    const asm = sections[0];
    expect(asm.label).toBe('ASM');
    expect(asm.start).toBe(0);
    expect(asm.end).toBe(4);
  });

  it('returns only the ASM section when no frame sections are provided', () => {
    const { sections } = buildCADU(new Uint8Array(8), TF_CONFIG);
    expect(sections.length).toBe(1);
  });

  it('offsets existing frame sections by ASM_SIZE', () => {
    const frameSections = [
      { label: 'Primary Header', start: 0, end: 6, color: '', textColor: '' },
      { label: 'Data Field', start: 6, end: 14, color: '', textColor: '' },
    ];
    const { sections } = buildCADU(new Uint8Array(14), TF_CONFIG, frameSections);
    expect(sections.length).toBe(3);
    expect(sections[1].label).toBe('Primary Header');
    expect(sections[1].start).toBe(4);
    expect(sections[1].end).toBe(10);
    expect(sections[2].label).toBe('Data Field');
    expect(sections[2].start).toBe(10);
    expect(sections[2].end).toBe(18);
  });

  it('section boundaries are contiguous when frame sections are provided', () => {
    const frameSections = [
      { label: 'A', start: 0, end: 6, color: '', textColor: '' },
      { label: 'B', start: 6, end: 14, color: '', textColor: '' },
    ];
    const { sections, cadu } = buildCADU(new Uint8Array(14), TF_CONFIG, frameSections);
    expect(sections[0].start).toBe(0);
    expect(sections[sections.length - 1].end).toBe(cadu.length);
    for (let i = 1; i < sections.length; i++) {
      expect(sections[i].start).toBe(sections[i - 1].end);
    }
  });
});

// ---------------------------------------------------------------------------
// buildCADU — Reed-Solomon payload
// ---------------------------------------------------------------------------

describe('buildCADU – Reed-Solomon payload', () => {
  const RS_CONFIG: CADUConfig = {
    caduRandomize: false,
    caduPayloadType: 'reed-solomon',
    rsVariant: 'RS_255_223',
    rsInterleaveDepth: 1,
    caduCodewordData: '',
  };

  it('CADU length = ASM_SIZE + 255 for RS(255,223) depth=1', () => {
    const { cadu, error } = buildCADU(new Uint8Array(223), RS_CONFIG);
    expect(error).toBeNull();
    expect(cadu.length).toBe(ASM_SIZE + 255);
  });

  it('CADU length = ASM_SIZE + 510 for RS(255,223) depth=2', () => {
    const cfg: CADUConfig = { ...RS_CONFIG, rsInterleaveDepth: 2 };
    const { cadu } = buildCADU(new Uint8Array(446), cfg);
    expect(cadu.length).toBe(ASM_SIZE + 510);
  });

  it('sections contain RS Data and RS Check entries', () => {
    const { sections } = buildCADU(new Uint8Array(223), RS_CONFIG);
    const rsData = sections.find(s => s.label.startsWith('RS Data'));
    const rsCheck = sections.find(s => s.label.startsWith('RS Check'));
    expect(rsData).toBeDefined();
    expect(rsCheck).toBeDefined();
  });

  it('ASM is still first 4 bytes', () => {
    const { cadu } = buildCADU(new Uint8Array(223), RS_CONFIG);
    expect(cadu[0]).toBe(0x1a);
    expect(cadu[3]).toBe(0x1d);
  });
});

// ---------------------------------------------------------------------------
// buildCADU — Codeword payload
// ---------------------------------------------------------------------------

describe('buildCADU – Codeword payload', () => {
  it('uses raw hex bytes as CADU payload', () => {
    const cfg: CADUConfig = {
      caduRandomize: false,
      caduPayloadType: 'codeword',
      rsVariant: 'RS_255_223',
      rsInterleaveDepth: 1,
      caduCodewordData: 'DEADBEEF',
    };
    const { cadu, error } = buildCADU(new Uint8Array(0), cfg);
    expect(error).toBeNull();
    expect(cadu.length).toBe(ASM_SIZE + 4);
    expect(cadu[4]).toBe(0xde);
    expect(cadu[5]).toBe(0xad);
    expect(cadu[6]).toBe(0xbe);
    expect(cadu[7]).toBe(0xef);
  });

  it('returns error for invalid hex', () => {
    const cfg: CADUConfig = {
      caduRandomize: false,
      caduPayloadType: 'codeword',
      rsVariant: 'RS_255_223',
      rsInterleaveDepth: 1,
      caduCodewordData: 'ZZZZ',
    };
    const { error } = buildCADU(new Uint8Array(0), cfg);
    expect(error).not.toBeNull();
  });

  it('empty codeword data gives CADU with only ASM', () => {
    const cfg: CADUConfig = {
      caduRandomize: false,
      caduPayloadType: 'codeword',
      rsVariant: 'RS_255_223',
      rsInterleaveDepth: 1,
      caduCodewordData: '',
    };
    const { cadu, error } = buildCADU(new Uint8Array(0), cfg);
    expect(error).toBeNull();
    expect(cadu.length).toBe(ASM_SIZE);
  });
});

// ---------------------------------------------------------------------------
// applyPRBS
// ---------------------------------------------------------------------------

describe('applyPRBS', () => {
  it('first output byte is 0xFF when input is 0x00 (seed = all-ones)', () => {
    // First PRBS mask byte with seed 0xFF = 0xFF
    expect(applyPRBS(new Uint8Array([0x00]))[0]).toBe(0xff);
  });

  it('first 40 mask bits match the sequence published in CCSDS 131.0-B-5', () => {
    // Independent known-answer vector: the standard states the first 40 bits
    // of the randomizer sequence are 1111 1111 0100 1000 0000 1110 1100 0000
    // 1001 1010 = FF 48 0E C0 9A. Applying to all-zeros reveals the mask.
    const result = applyPRBS(new Uint8Array(5));
    expect(Array.from(result)).toEqual([0xff, 0x48, 0x0e, 0xc0, 0x9a]);
  });

  it('mask sequence repeats with a 255-byte period', () => {
    // The LFSR has a 255-bit period; over bytes the pattern therefore
    // repeats every 255 bytes (LCM(255, 8) / 8 = 255).
    const mask = applyPRBS(new Uint8Array(512));
    for (let i = 0; i + 255 < mask.length; i++) {
      expect(mask[i]).toBe(mask[i + 255]);
    }
  });

  it('mask does not repeat with any shorter byte period', () => {
    const mask = applyPRBS(new Uint8Array(510));
    for (const period of [15, 51, 85, 128]) {
      let repeats = true;
      for (let i = 0; i + period < 255; i++) {
        if (mask[i] !== mask[i + period]) { repeats = false; break; }
      }
      expect(repeats).toBe(false);
    }
  });

  it('is self-inverse: applying twice returns the original data', () => {
    const original = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0xff, 0x42, 0x13]);
    const once = applyPRBS(original);
    const twice = applyPRBS(once);
    expect(twice).toEqual(original);
  });

  it('returns an empty array for empty input', () => {
    expect(applyPRBS(new Uint8Array(0))).toEqual(new Uint8Array(0));
  });

  it('does not modify the input array', () => {
    const input = new Uint8Array([0xaa, 0xbb]);
    const copy = new Uint8Array(input);
    applyPRBS(input);
    expect(input).toEqual(copy);
  });

  it('output differs from input for typical data', () => {
    const input = new Uint8Array(16).fill(0x55);
    const output = applyPRBS(input);
    expect(output).not.toEqual(input);
  });
});
