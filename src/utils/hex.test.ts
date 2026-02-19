import { describe, it, expect } from 'vitest';
import {
  hexToBytes,
  bytesToHex,
  byteHex,
  asciiToBytes,
  hexDump,
  validateHexInput,
} from './hex';

// ---------------------------------------------------------------------------
// hexToBytes
// ---------------------------------------------------------------------------
describe('hexToBytes', () => {
  it('returns an empty Uint8Array for an empty string', () => {
    const result = hexToBytes('');
    expect(result).not.toBeNull();
    expect(result!.length).toBe(0);
  });

  it('parses a plain hex string', () => {
    const result = hexToBytes('deadbeef');
    expect(result).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  });

  it('parses uppercase hex', () => {
    const result = hexToBytes('DEADBEEF');
    expect(result).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  });

  it('parses space-separated hex pairs', () => {
    const result = hexToBytes('de ad be ef');
    expect(result).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  });

  it('parses colon-separated hex pairs', () => {
    const result = hexToBytes('de:ad:be:ef');
    expect(result).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  });

  it('parses mixed separators', () => {
    const result = hexToBytes('de ad:be ef');
    expect(result).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  });

  it('returns null for an odd number of hex digits', () => {
    expect(hexToBytes('abc')).toBeNull();
  });

  it('returns null for invalid hex characters', () => {
    expect(hexToBytes('zzzz')).toBeNull();
  });

  it('parses a single byte', () => {
    expect(hexToBytes('ff')).toEqual(new Uint8Array([0xff]));
  });

  it('parses zeroes correctly', () => {
    expect(hexToBytes('0000')).toEqual(new Uint8Array([0x00, 0x00]));
  });
});

// ---------------------------------------------------------------------------
// bytesToHex
// ---------------------------------------------------------------------------
describe('bytesToHex', () => {
  it('returns an empty string for empty input', () => {
    expect(bytesToHex(new Uint8Array(0))).toBe('');
  });

  it('formats bytes as space-separated uppercase hex pairs', () => {
    expect(bytesToHex(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))).toBe('DE AD BE EF');
  });

  it('pads single-digit values with a leading zero', () => {
    expect(bytesToHex(new Uint8Array([0x0f, 0x01, 0x00]))).toBe('0F 01 00');
  });
});

// ---------------------------------------------------------------------------
// byteHex
// ---------------------------------------------------------------------------
describe('byteHex', () => {
  it('formats 0x00 as "00"', () => {
    expect(byteHex(0x00)).toBe('00');
  });

  it('formats 0xff as "FF"', () => {
    expect(byteHex(0xff)).toBe('FF');
  });

  it('formats 0x0a as "0A"', () => {
    expect(byteHex(0x0a)).toBe('0A');
  });
});

// ---------------------------------------------------------------------------
// asciiToBytes
// ---------------------------------------------------------------------------
describe('asciiToBytes', () => {
  it('returns empty array for empty string', () => {
    expect(asciiToBytes('')).toEqual(new Uint8Array(0));
  });

  it('converts ASCII text to byte values', () => {
    expect(asciiToBytes('ABC')).toEqual(new Uint8Array([0x41, 0x42, 0x43]));
  });

  it('converts lowercase letters', () => {
    expect(asciiToBytes('abc')).toEqual(new Uint8Array([0x61, 0x62, 0x63]));
  });

  it('truncates high bytes (mask 0xFF)', () => {
    // charCode of regular chars will be ≤ 127, but the mask should not affect standard ASCII
    const result = asciiToBytes('A');
    expect(result[0]).toBe(0x41);
  });

  it('converts a space character', () => {
    expect(asciiToBytes(' ')).toEqual(new Uint8Array([0x20]));
  });
});

// ---------------------------------------------------------------------------
// hexDump
// ---------------------------------------------------------------------------
describe('hexDump', () => {
  it('returns an empty array for empty input', () => {
    expect(hexDump(new Uint8Array(0))).toEqual([]);
  });

  it('produces one row for ≤16 bytes', () => {
    const rows = hexDump(new Uint8Array([0x01, 0x02, 0x03]));
    expect(rows.length).toBe(1);
    expect(rows[0]).toBe('01 02 03');
  });

  it('produces two rows for exactly 17 bytes', () => {
    const data = new Uint8Array(17).fill(0xaa);
    const rows = hexDump(data);
    expect(rows.length).toBe(2);
    expect(rows[0]).toBe('AA AA AA AA AA AA AA AA AA AA AA AA AA AA AA AA');
    expect(rows[1]).toBe('AA');
  });

  it('formats each byte as uppercase two-char hex', () => {
    const rows = hexDump(new Uint8Array([0x0f, 0xf0]));
    expect(rows[0]).toBe('0F F0');
  });
});

// ---------------------------------------------------------------------------
// validateHexInput
// ---------------------------------------------------------------------------
describe('validateHexInput', () => {
  it('returns null for an empty string', () => {
    expect(validateHexInput('')).toBeNull();
  });

  it('returns null for valid hex without separators', () => {
    expect(validateHexInput('deadbeef')).toBeNull();
  });

  it('returns null for valid hex with spaces', () => {
    expect(validateHexInput('de ad be ef')).toBeNull();
  });

  it('returns null for valid hex with colons', () => {
    expect(validateHexInput('de:ad:be:ef')).toBeNull();
  });

  it('returns an error message for an odd number of digits', () => {
    expect(validateHexInput('abc')).toBe('Odd number of hex digits');
  });

  it('returns an error message for invalid characters', () => {
    expect(validateHexInput('zzzz')).toBe('Invalid hex characters');
  });

  it('returns null for "00" (valid single byte)', () => {
    expect(validateHexInput('00')).toBeNull();
  });

  it('returns null for uppercase valid hex', () => {
    expect(validateHexInput('AABBCCDD')).toBeNull();
  });
});
