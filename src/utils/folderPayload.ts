/**
 * Folder-rotation payload source.
 *
 * A folder of hex payload files is cycled in alphanumeric order during live
 * transmission: one file per frame, wrapping back to the first file after the
 * last. Files are read fresh on every call — content is never cached, so
 * edits made between cycles are picked up automatically.
 */

import { hexToBytes } from './hex';

/** Minimal file shape the reader needs — satisfied by the DOM File type. */
export interface PayloadFileLike {
  name: string;
  text(): Promise<string>;
}

/**
 * Sort files alphanumerically by name with numeric awareness,
 * so payload_2.hex sorts before payload_10.hex.
 */
export function sortPayloadFiles<T extends { name: string }>(files: T[]): T[] {
  return [...files].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
  );
}

/**
 * Keep only direct children of the selected folder.
 * webkitRelativePath is "<folder>/<file>" for top-level entries (depth 2).
 */
export function filterTopLevelFiles<T extends { webkitRelativePath: string }>(
  files: T[],
): T[] {
  return files.filter(f => f.webkitRelativePath.split('/').length === 2);
}

export interface FolderPayloadReader {
  /** Number of files in the rotation. */
  readonly length: number;
  /**
   * Read the next file in the rotation (fresh from disk) and advance.
   * Returns the parsed payload bytes and the index of the file that was read.
   * Invalid hex content yields empty bytes (idle fill pads the frame).
   */
  next(): Promise<{ bytes: Uint8Array; index: number }>;
  /** Restart the rotation from the first file. */
  reset(): void;
}

/**
 * Create a rotating reader over an ordered list of hex payload files.
 * The caller is responsible for ordering (see sortPayloadFiles).
 */
export function createFolderPayloadReader(files: PayloadFileLike[]): FolderPayloadReader {
  if (files.length === 0) {
    throw new RangeError('createFolderPayloadReader: files must not be empty');
  }

  let index = 0;

  return {
    get length() {
      return files.length;
    },
    async next() {
      const current = index;
      index = (index + 1) % files.length;
      const text = await files[current].text();
      const bytes = hexToBytes(text.trim()) ?? new Uint8Array(0);
      return { bytes, index: current };
    },
    reset() {
      index = 0;
    },
  };
}
