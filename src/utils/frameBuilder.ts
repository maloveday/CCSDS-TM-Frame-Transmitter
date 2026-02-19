/**
 * CCSDS TM Transfer Frame builder.
 * Reference: CCSDS 132.0-B-3 (Blue Book, Issue 3, September 2015)
 *
 * Frame structure:
 *   [Primary Header 6B] [Secondary Header opt] [Data Field] [OCF opt 4B] [FECF opt 2B]
 *
 * Primary Header (48 bits / 6 bytes):
 *   Bits  0– 1 : Transfer Frame Version Number = 00
 *   Bits  2–11 : Spacecraft ID (SCID), 10 bits
 *   Bits 12–14 : Virtual Channel ID (VCID), 3 bits
 *   Bit     15 : Operational Control Field Flag
 *   Bits 16–23 : Master Channel Frame Count (MCFC), 8 bits
 *   Bits 24–31 : Virtual Channel Frame Count (VCFC), 8 bits
 *   Bit     32 : TF Secondary Header Flag
 *   Bit     33 : Synchronization Flag
 *   Bit     34 : Packet Order Flag
 *   Bits 35–36 : Segment Length ID, 2 bits
 *   Bits 37–47 : First Header Pointer, 11 bits
 *
 * Secondary Header ID (first byte of secondary header):
 *   Bits 0–1 : TF SH Version Number = 00
 *   Bits 2–7 : TF SH Data Field Length (number of bytes in SH data field, 1–63)
 */

import type { FrameConfig, FrameSection } from '../types';
import { crc16ccitt } from './crc';
import { hexToBytes } from './hex';

export interface BuildResult {
  frame: Uint8Array;
  sections: FrameSection[];
  dataFieldLength: number;
  payloadBytesUsed: number;
  idleBytesUsed: number;
  error: string | null;
}

// Sentinel values for First Header Pointer
export const FHP_IDLE = 0x7fe;       // Frame contains only idle data
export const FHP_NO_PACKET = 0x7ff;  // No first packet header in data field

export function buildTMFrame(
  config: FrameConfig,
  payload: Uint8Array,
  mcfc: number,
  vcfc: number,
): BuildResult {
  const sections: FrameSection[] = [];

  // --- Validate frame length ---
  const minLength = 7; // 6 primary header + 1 byte data field minimum
  if (config.frameLength < minLength || config.frameLength > 2048) {
    return {
      frame: new Uint8Array(0),
      sections: [],
      dataFieldLength: 0,
      payloadBytesUsed: 0,
      idleBytesUsed: 0,
      error: `Frame length must be between ${minLength} and 2048 bytes`,
    };
  }

  // --- Parse optional fields ---
  let shBytes = new Uint8Array(0);
  if (config.hasSecondaryHeader) {
    const parsed = hexToBytes(config.secondaryHeaderData);
    if (!parsed) {
      return { frame: new Uint8Array(0), sections: [], dataFieldLength: 0, payloadBytesUsed: 0, idleBytesUsed: 0, error: 'Invalid secondary header hex data' };
    }
    shBytes = parsed.slice(0, 63); // max 63 bytes of SH data
  }

  let ocfBytes = new Uint8Array(4);
  if (config.hasOCF) {
    const parsed = hexToBytes(config.ocfData);
    if (!parsed || parsed.length < 4) {
      ocfBytes = new Uint8Array(4); // default zeros
    } else {
      ocfBytes = parsed.slice(0, 4);
    }
  }

  // --- Calculate section sizes ---
  const primaryHeaderSize = 6;
  const secondaryHeaderSize = config.hasSecondaryHeader ? (1 + shBytes.length) : 0;
  const ocfSize = config.hasOCF ? 4 : 0;
  const fecfSize = config.hasFECF ? 2 : 0;
  const overhead = primaryHeaderSize + secondaryHeaderSize + ocfSize + fecfSize;
  const dataFieldLength = config.frameLength - overhead;

  if (dataFieldLength < 1) {
    return {
      frame: new Uint8Array(0),
      sections: [],
      dataFieldLength: 0,
      payloadBytesUsed: 0,
      idleBytesUsed: 0,
      error: `Frame too small for configured options. Need at least ${overhead + 1} bytes.`,
    };
  }

  const frame = new Uint8Array(config.frameLength);
  let offset = 0;

  // --- Primary Header ---
  const phStart = offset;

  // Word 0–1 (16 bits): TFVN(2) + SCID(10) + VCID(3) + OCF(1)
  const word01 =
    ((0b00) << 14) |
    ((config.scid & 0x3ff) << 4) |
    ((config.vcid & 0x07) << 1) |
    (config.hasOCF ? 1 : 0);
  frame[offset++] = (word01 >> 8) & 0xff;
  frame[offset++] = word01 & 0xff;

  // Byte 2: Master Channel Frame Count
  frame[offset++] = mcfc & 0xff;

  // Byte 3: Virtual Channel Frame Count
  frame[offset++] = vcfc & 0xff;

  // Bytes 4–5 (16 bits): SH Flag(1) + Sync(1) + PO Flag(1) + SegID(2) + FHP(11)
  const word45 =
    ((config.hasSecondaryHeader ? 1 : 0) << 15) |
    ((config.syncFlag ? 1 : 0) << 14) |
    ((config.packetOrderFlag ? 1 : 0) << 13) |
    ((config.segmentLengthId & 0x03) << 11) |
    (config.firstHeaderPointer & 0x7ff);
  frame[offset++] = (word45 >> 8) & 0xff;
  frame[offset++] = word45 & 0xff;

  sections.push({
    label: 'Primary Header',
    start: phStart,
    end: offset,
    color: 'bg-sky-900/60',
    textColor: 'text-sky-300',
  });

  // --- Secondary Header ---
  if (config.hasSecondaryHeader) {
    const shStart = offset;
    // SH ID byte: TF SH Version(2b=00) + SH Data Field Length(6b)
    frame[offset++] = ((0b00) << 6) | (shBytes.length & 0x3f);
    if (shBytes.length > 0) {
      frame.set(shBytes, offset);
      offset += shBytes.length;
    }
    sections.push({
      label: 'Secondary Header',
      start: shStart,
      end: offset,
      color: 'bg-purple-900/60',
      textColor: 'text-purple-300',
    });
  }

  // --- Data Field ---
  const dataStart = offset;
  const payloadBytesUsed = Math.min(payload.length, dataFieldLength);
  const idleBytesUsed = dataFieldLength - payloadBytesUsed;

  if (payloadBytesUsed > 0) {
    frame.set(payload.slice(0, payloadBytesUsed), offset);
  }
  // Fill remainder with idle byte
  for (let i = payloadBytesUsed; i < dataFieldLength; i++) {
    frame[offset + i] = config.idleFillByte;
  }

  sections.push({
    label: 'Data Field',
    start: dataStart,
    end: dataStart + dataFieldLength,
    color: 'bg-emerald-900/60',
    textColor: 'text-emerald-300',
  });

  offset += dataFieldLength;

  // --- OCF ---
  if (config.hasOCF) {
    const ocfStart = offset;
    frame.set(ocfBytes, offset);
    offset += 4;
    sections.push({
      label: 'OCF',
      start: ocfStart,
      end: offset,
      color: 'bg-amber-900/60',
      textColor: 'text-amber-300',
    });
  }

  // --- FECF (CRC-16 CCITT) ---
  if (config.hasFECF) {
    const fecfStart = offset;
    const crc = crc16ccitt(frame.slice(0, offset));
    frame[offset++] = (crc >> 8) & 0xff;
    frame[offset++] = crc & 0xff;
    sections.push({
      label: 'FECF',
      start: fecfStart,
      end: offset,
      color: 'bg-red-900/60',
      textColor: 'text-red-300',
    });
  }

  return {
    frame,
    sections,
    dataFieldLength,
    payloadBytesUsed,
    idleBytesUsed,
    error: null,
  };
}

/** Returns the number of bytes available for payload given current config. */
export function availableDataBytes(config: FrameConfig): number {
  const shDataLen = config.hasSecondaryHeader
    ? Math.min(Math.floor(config.secondaryHeaderData.replace(/[\s:]/g, '').length / 2), 63)
    : 0;
  const secondaryHeaderSize = config.hasSecondaryHeader ? (1 + shDataLen) : 0;
  const ocfSize = config.hasOCF ? 4 : 0;
  const fecfSize = config.hasFECF ? 2 : 0;
  const overhead = 6 + secondaryHeaderSize + ocfSize + fecfSize;
  return Math.max(0, config.frameLength - overhead);
}
