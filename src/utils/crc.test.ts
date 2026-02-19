import { describe, it, expect } from 'vitest';
import { crc16ccitt } from './crc';

describe('crc16ccitt', () => {
  it('returns 0xFFFF for empty input', () => {
    expect(crc16ccitt(new Uint8Array(0))).toBe(0xffff);
  });

  it('computes the standard CCITT check value for "123456789"', () => {
    // CRC-16/CCITT-FALSE known vector: 0x29B1
    const data = new Uint8Array([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39]);
    expect(crc16ccitt(data)).toBe(0x29b1);
  });

  it('returns a 16-bit value in range 0x0000–0xFFFF', () => {
    const result = crc16ccitt(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(0xffff);
    expect(result).toBe(0x4097);
  });

  it('produces different values for different inputs', () => {
    const a = crc16ccitt(new Uint8Array([0x01]));
    const b = crc16ccitt(new Uint8Array([0x02]));
    expect(a).not.toBe(b);
  });

  it('produces consistent results for the same input', () => {
    const data = new Uint8Array([0xca, 0xfe, 0xba, 0xbe]);
    expect(crc16ccitt(data)).toBe(crc16ccitt(data));
  });

  it('is sensitive to byte order', () => {
    const ab = crc16ccitt(new Uint8Array([0xab, 0xcd]));
    const ba = crc16ccitt(new Uint8Array([0xcd, 0xab]));
    expect(ab).not.toBe(ba);
  });

  it('computes correct CRC for a single 0x00 byte', () => {
    expect(crc16ccitt(new Uint8Array([0x00]))).toBe(0xe1f0);
  });

  it('computes correct CRC for a single 0xFF byte', () => {
    expect(crc16ccitt(new Uint8Array([0xff]))).toBe(0xff00);
  });
});
