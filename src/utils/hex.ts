/** Parse a hex string (with or without spaces/colons) into bytes. Returns null on error. */
export function hexToBytes(hex: string): Uint8Array | null {
  const clean = hex.replace(/[\s:]/g, '');
  if (clean.length % 2 !== 0) return null;
  if (clean.length === 0) return new Uint8Array(0);
  const invalid = /[^0-9a-fA-F]/.test(clean);
  if (invalid) return null;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Format a hex string with space-separated pairs. */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}

/** Format a single byte as uppercase two-char hex. */
export function byteHex(b: number): string {
  return b.toString(16).padStart(2, '0').toUpperCase();
}

/** Parse ASCII input to bytes. */
export function asciiToBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    bytes[i] = text.charCodeAt(i) & 0xff;
  }
  return bytes;
}

/** Format bytes as a hex dump with 16 bytes per row. */
export function hexDump(bytes: Uint8Array): string[] {
  const rows: string[] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const slice = bytes.slice(i, i + 16);
    const hex = Array.from(slice)
      .map(b => b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ');
    rows.push(hex);
  }
  return rows;
}

/** Validate hex input string — returns error message or null. */
export function validateHexInput(hex: string): string | null {
  const clean = hex.replace(/[\s:]/g, '');
  if (clean.length === 0) return null;
  if (clean.length % 2 !== 0) return 'Odd number of hex digits';
  if (/[^0-9a-fA-F]/.test(clean)) return 'Invalid hex characters';
  return null;
}
