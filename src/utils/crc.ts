/**
 * CRC-16/CCITT-FALSE (initial value 0xFFFF, polynomial 0x1021, no input/output reflection)
 * Used for CCSDS TM Transfer Frame Error Control Field (FECF).
 * Reference: CCSDS 132.0-B-3, Section 4.1.6
 */
export function crc16ccitt(data: Uint8Array): number {
  let crc = 0xffff;
  for (const byte of data) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc;
}
