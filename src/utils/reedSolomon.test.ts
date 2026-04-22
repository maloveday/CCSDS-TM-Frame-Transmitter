import { describe, it, expect } from 'vitest';
import {
  rsEncodeBlock,
  rsEncode,
  rsIsValidCodeword,
  buildGenPoly,
  gfMul,
  GF_EXP,
  GF_LOG,
  RS_VARIANT_INFO,
} from './reedSolomon';

// ---------------------------------------------------------------------------
// GF(2^8) table correctness
// ---------------------------------------------------------------------------

describe('GF(2^8) tables', () => {
  it('GF_EXP[0] = 1 (α^0 = 1)', () => {
    expect(GF_EXP[0]).toBe(1);
  });

  it('GF_EXP[1] = 2 (primitive element α = 0x02)', () => {
    expect(GF_EXP[1]).toBe(2);
  });

  it('GF_EXP[254] is non-zero (all 255 elements are non-zero)', () => {
    for (let i = 0; i < 255; i++) {
      expect(GF_EXP[i]).not.toBe(0);
    }
  });

  it('GF_EXP[255] = GF_EXP[0] = 1 (period 255)', () => {
    expect(GF_EXP[255]).toBe(GF_EXP[0]);
  });

  it('GF_LOG[GF_EXP[i]] = i for i in 0..254', () => {
    for (let i = 0; i < 255; i++) {
      expect(GF_LOG[GF_EXP[i]]).toBe(i);
    }
  });

  it('all 255 non-zero elements appear in GF_EXP[0..254] (field is cyclic)', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 255; i++) seen.add(GF_EXP[i]);
    expect(seen.size).toBe(255);
    expect(seen.has(0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Generator polynomial
// ---------------------------------------------------------------------------

describe('buildGenPoly', () => {
  it('RS(255,223): generator has degree 32 (33 coefficients)', () => {
    const gen = buildGenPoly(32, 112);
    expect(gen.length).toBe(33);
  });

  it('RS(255,239): generator has degree 16 (17 coefficients)', () => {
    const gen = buildGenPoly(16, 112);
    expect(gen.length).toBe(17);
  });

  it('leading coefficient is 1 (monic polynomial)', () => {
    const gen32 = buildGenPoly(32, 112);
    const gen16 = buildGenPoly(16, 112);
    expect(gen32[32]).toBe(1);
    expect(gen16[16]).toBe(1);
  });

  it('constant term (gen[0]) is non-zero (no zero root at x=0)', () => {
    expect(buildGenPoly(32, 112)[0]).not.toBe(0);
    expect(buildGenPoly(16, 112)[0]).not.toBe(0);
  });

  it('generator has all FCR+j as roots for j=0..2t-1', () => {
    // buildGenPoly stores coefficients in ascending order: gen[i] = coeff of x^i
    // Evaluate using Horner's in ascending order: acc = gen[deg]; for i=deg-1..0: acc=acc*x ^ gen[i]
    function evalAscending(coeffs: Uint8Array, x: number): number {
      let acc = 0;
      for (let i = coeffs.length - 1; i >= 0; i--) {
        acc = gfMul(acc, x) ^ coeffs[i];
      }
      return acc;
    }
    const twoT = 16;
    const fcr = 112;
    const gen = buildGenPoly(twoT, fcr);
    for (let j = 0; j < twoT; j++) {
      const root = GF_EXP[(fcr + j) % 255];
      expect(evalAscending(gen, root)).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// rsEncodeBlock
// ---------------------------------------------------------------------------

describe('rsEncodeBlock', () => {
  it('RS(255,223): output length is 255', () => {
    const data = new Uint8Array(223);
    expect(rsEncodeBlock(data, 'RS_255_223').length).toBe(255);
  });

  it('RS(255,239): output length is 255', () => {
    const data = new Uint8Array(239);
    expect(rsEncodeBlock(data, 'RS_255_239').length).toBe(255);
  });

  it('first k bytes of output equal the input data (systematic code)', () => {
    const data = new Uint8Array(223).map((_, i) => (i * 37 + 5) & 0xff);
    const codeword = rsEncodeBlock(data, 'RS_255_223');
    for (let i = 0; i < 223; i++) {
      expect(codeword[i]).toBe(data[i]);
    }
  });

  it('all-zeros data yields all-zero check symbols', () => {
    const data = new Uint8Array(223); // all zeros
    const codeword = rsEncodeBlock(data, 'RS_255_223');
    for (let i = 223; i < 255; i++) {
      expect(codeword[i]).toBe(0);
    }
  });

  it('all-zeros data RS(255,239) yields all-zero check symbols', () => {
    const data = new Uint8Array(239);
    const codeword = rsEncodeBlock(data, 'RS_255_239');
    for (let i = 239; i < 255; i++) {
      expect(codeword[i]).toBe(0);
    }
  });

  it('non-zero data produces non-zero check symbols (encoding is active)', () => {
    const data = new Uint8Array(223).fill(0x01);
    const codeword = rsEncodeBlock(data, 'RS_255_223');
    const checkBytes = codeword.slice(223);
    const allZero = Array.from(checkBytes).every(b => b === 0);
    expect(allZero).toBe(false);
  });

  it('different data produces different check symbols', () => {
    const data1 = new Uint8Array(223).fill(0xaa);
    const data2 = new Uint8Array(223).fill(0x55);
    const cw1 = rsEncodeBlock(data1, 'RS_255_223').slice(223);
    const cw2 = rsEncodeBlock(data2, 'RS_255_223').slice(223);
    expect(cw1).not.toEqual(cw2);
  });

  it('throws when data length is wrong', () => {
    expect(() => rsEncodeBlock(new Uint8Array(100), 'RS_255_223')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Syndrome validation (rsIsValidCodeword)
// ---------------------------------------------------------------------------

describe('rsIsValidCodeword', () => {
  it('a freshly encoded RS(255,223) codeword passes validation', () => {
    const data = new Uint8Array(223).map((_, i) => (i * 13 + 7) & 0xff);
    const codeword = rsEncodeBlock(data, 'RS_255_223');
    expect(rsIsValidCodeword(codeword, 'RS_255_223')).toBe(true);
  });

  it('a freshly encoded RS(255,239) codeword passes validation', () => {
    const data = new Uint8Array(239).map((_, i) => (i * 31 + 11) & 0xff);
    const codeword = rsEncodeBlock(data, 'RS_255_239');
    expect(rsIsValidCodeword(codeword, 'RS_255_239')).toBe(true);
  });

  it('all-zeros RS(255,223) codeword is valid', () => {
    expect(rsIsValidCodeword(new Uint8Array(255), 'RS_255_223')).toBe(true);
  });

  it('all-zeros RS(255,239) codeword is valid', () => {
    expect(rsIsValidCodeword(new Uint8Array(255), 'RS_255_239')).toBe(true);
  });

  it('flipping one byte in the data field makes the codeword invalid', () => {
    const data = new Uint8Array(223).fill(0x42);
    const codeword = rsEncodeBlock(data, 'RS_255_223');
    const corrupted = new Uint8Array(codeword);
    corrupted[10] ^= 0xff; // flip all bits in byte 10
    expect(rsIsValidCodeword(corrupted, 'RS_255_223')).toBe(false);
  });

  it('flipping one check byte makes the codeword invalid', () => {
    const data = new Uint8Array(239).fill(0x33);
    const codeword = rsEncodeBlock(data, 'RS_255_239');
    const corrupted = new Uint8Array(codeword);
    corrupted[240] ^= 0x01;
    expect(rsIsValidCodeword(corrupted, 'RS_255_239')).toBe(false);
  });

  it('returns false for wrong-length input', () => {
    expect(rsIsValidCodeword(new Uint8Array(100), 'RS_255_223')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// rsEncode (interleaved)
// ---------------------------------------------------------------------------

describe('rsEncode', () => {
  it('depth=1: output length is 255', () => {
    expect(rsEncode(new Uint8Array(223), 'RS_255_223', 1).length).toBe(255);
  });

  it('depth=1: result equals rsEncodeBlock output', () => {
    const data = new Uint8Array(223).map((_, i) => i & 0xff);
    expect(rsEncode(data, 'RS_255_223', 1)).toEqual(rsEncodeBlock(data, 'RS_255_223'));
  });

  it('depth=2: output length is 510 (2×255)', () => {
    expect(rsEncode(new Uint8Array(446), 'RS_255_223', 2).length).toBe(510);
  });

  it('depth=5: output length is 1275 (5×255)', () => {
    expect(rsEncode(new Uint8Array(1115), 'RS_255_223', 5).length).toBe(1275);
  });

  it('depth=8: output length is 2040 (8×255)', () => {
    expect(rsEncode(new Uint8Array(1784), 'RS_255_223', 8).length).toBe(2040);
  });

  it('RS(255,239) depth=4: output length is 1020', () => {
    expect(rsEncode(new Uint8Array(956), 'RS_255_239', 4).length).toBe(1020);
  });

  it('short input is zero-padded to k*depth', () => {
    // Providing only 10 bytes for RS(255,223) with depth=1 — pads to 223
    const result = rsEncode(new Uint8Array([0x01, 0x02]), 'RS_255_223', 1);
    expect(result.length).toBe(255);
    // The first two data bytes should match input
    expect(result[0]).toBe(0x01);
    expect(result[1]).toBe(0x02);
  });

  it('depth=2 interleave: first two bytes come from different codewords', () => {
    // With all-zeros data, all codewords are all-zeros, so this tests the structure
    const data = new Uint8Array(446); // 2*223
    data[0] = 0xaa; // First byte of sub-block 0
    data[223] = 0xbb; // First byte of sub-block 1

    const result = rsEncode(data, 'RS_255_223', 2);
    // Interleaved: result[0] = codeword_0[0], result[1] = codeword_1[0]
    expect(result[0]).toBe(0xaa); // Sub-block 0, byte 0
    expect(result[1]).toBe(0xbb); // Sub-block 1, byte 0
  });

  it('RS_VARIANT_INFO matches encoder behaviour', () => {
    const info223 = RS_VARIANT_INFO['RS_255_223'];
    expect(info223.n).toBe(255);
    expect(info223.k).toBe(223);
    expect(info223.twoT).toBe(32);
    expect(info223.fcr).toBe(112);

    const info239 = RS_VARIANT_INFO['RS_255_239'];
    expect(info239.n).toBe(255);
    expect(info239.k).toBe(239);
    expect(info239.twoT).toBe(16);
    expect(info239.fcr).toBe(112);
  });
});
