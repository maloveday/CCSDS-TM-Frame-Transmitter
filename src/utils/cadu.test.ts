import { describe, it, expect } from 'vitest';
import { ASM, ASM_SIZE, buildCADU, applyPRBS } from './cadu';

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
// buildCADU — structure
// ---------------------------------------------------------------------------

describe('buildCADU – structure', () => {
  it('output length equals ASM_SIZE + frame.length', () => {
    const frame = new Uint8Array(7).fill(0x00);
    const { cadu } = buildCADU(frame, false);
    expect(cadu.length).toBe(ASM_SIZE + 7);
  });

  it('first 4 bytes are always the ASM', () => {
    const frame = new Uint8Array(16).fill(0xaa);
    const { cadu } = buildCADU(frame, false);
    expect(cadu[0]).toBe(0x1a);
    expect(cadu[1]).toBe(0xcf);
    expect(cadu[2]).toBe(0xfc);
    expect(cadu[3]).toBe(0x1d);
  });

  it('without randomization: frame bytes follow ASM unchanged', () => {
    const frame = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    const { cadu } = buildCADU(frame, false);
    expect(cadu[4]).toBe(0x01);
    expect(cadu[5]).toBe(0x02);
    expect(cadu[6]).toBe(0x03);
    expect(cadu[7]).toBe(0x04);
  });

  it('with randomization: ASM bytes are still unmodified', () => {
    const frame = new Uint8Array(8).fill(0xff);
    const { cadu } = buildCADU(frame, true);
    expect(cadu[0]).toBe(0x1a);
    expect(cadu[1]).toBe(0xcf);
    expect(cadu[2]).toBe(0xfc);
    expect(cadu[3]).toBe(0x1d);
  });

  it('with randomization: frame bytes differ from original', () => {
    const frame = new Uint8Array(8).fill(0x00);
    const { cadu } = buildCADU(frame, true);
    // PRBS applied to all-zeros gives the PRBS mask itself — must differ from 0x00
    const frameBytes = cadu.slice(ASM_SIZE);
    const allZero = frameBytes.every(b => b === 0x00);
    expect(allZero).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildCADU — sections
// ---------------------------------------------------------------------------

describe('buildCADU – sections', () => {
  it('first section is the ASM, spanning bytes 0–4', () => {
    const { sections } = buildCADU(new Uint8Array(8), false);
    const asm = sections[0];
    expect(asm.label).toBe('ASM');
    expect(asm.start).toBe(0);
    expect(asm.end).toBe(4);
  });

  it('returns only the ASM section when no frame sections are provided', () => {
    const { sections } = buildCADU(new Uint8Array(8), false);
    expect(sections.length).toBe(1);
  });

  it('offsets existing frame sections by ASM_SIZE', () => {
    const frameSections = [
      { label: 'Primary Header', start: 0, end: 6, color: '', textColor: '' },
      { label: 'Data Field', start: 6, end: 14, color: '', textColor: '' },
    ];
    const { sections } = buildCADU(new Uint8Array(14), false, frameSections);
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
    const { sections, cadu } = buildCADU(new Uint8Array(14), false, frameSections);
    expect(sections[0].start).toBe(0);
    expect(sections[sections.length - 1].end).toBe(cadu.length);
    for (let i = 1; i < sections.length; i++) {
      expect(sections[i].start).toBe(sections[i - 1].end);
    }
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

  it('first 4 mask bytes match expected LFSR sequence', () => {
    // Applying to all-zeros reveals the mask: 0xFF, 0x5A, 0xEA, 0xB2
    const result = applyPRBS(new Uint8Array([0x00, 0x00, 0x00, 0x00]));
    expect(result[0]).toBe(0xff);
    expect(result[1]).toBe(0x5a);
    expect(result[2]).toBe(0xea);
    expect(result[3]).toBe(0xb2);
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
