import { describe, it, expect, vi } from 'vitest';
import {
  sortPayloadFiles,
  filterTopLevelFiles,
  createFolderPayloadReader,
} from './folderPayload';
import type { PayloadFileLike } from './folderPayload';

/** Mock file whose content can change between reads. */
function makeFile(name: string, content: string): PayloadFileLike & { setContent: (c: string) => void; textSpy: ReturnType<typeof vi.fn> } {
  let current = content;
  const textSpy = vi.fn(async () => current);
  return {
    name,
    text: textSpy,
    textSpy,
    setContent: (c: string) => { current = c; },
  };
}

// ---------------------------------------------------------------------------
// sortPayloadFiles
// ---------------------------------------------------------------------------

describe('sortPayloadFiles', () => {
  it('sorts plain names alphabetically', () => {
    const sorted = sortPayloadFiles([{ name: 'c.hex' }, { name: 'a.hex' }, { name: 'b.hex' }]);
    expect(sorted.map(f => f.name)).toEqual(['a.hex', 'b.hex', 'c.hex']);
  });

  it('sorts numerically: payload_2 before payload_10', () => {
    const sorted = sortPayloadFiles([
      { name: 'payload_10.hex' },
      { name: 'payload_2.hex' },
      { name: 'payload_1.hex' },
    ]);
    expect(sorted.map(f => f.name)).toEqual([
      'payload_1.hex',
      'payload_2.hex',
      'payload_10.hex',
    ]);
  });

  it('is case-insensitive', () => {
    const sorted = sortPayloadFiles([{ name: 'B.hex' }, { name: 'a.hex' }]);
    expect(sorted.map(f => f.name)).toEqual(['a.hex', 'B.hex']);
  });

  it('does not mutate the input array', () => {
    const input = [{ name: 'b' }, { name: 'a' }];
    sortPayloadFiles(input);
    expect(input.map(f => f.name)).toEqual(['b', 'a']);
  });
});

// ---------------------------------------------------------------------------
// filterTopLevelFiles
// ---------------------------------------------------------------------------

describe('filterTopLevelFiles', () => {
  it('keeps direct children and drops nested files', () => {
    const files = [
      { webkitRelativePath: 'payloads/a.hex' },
      { webkitRelativePath: 'payloads/sub/b.hex' },
      { webkitRelativePath: 'payloads/c.hex' },
      { webkitRelativePath: 'payloads/sub/deep/d.hex' },
    ];
    const kept = filterTopLevelFiles(files);
    expect(kept.map(f => f.webkitRelativePath)).toEqual([
      'payloads/a.hex',
      'payloads/c.hex',
    ]);
  });

  it('returns empty array when all files are nested', () => {
    const files = [{ webkitRelativePath: 'payloads/sub/a.hex' }];
    expect(filterTopLevelFiles(files)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// createFolderPayloadReader
// ---------------------------------------------------------------------------

describe('createFolderPayloadReader', () => {
  it('throws on an empty file list', () => {
    expect(() => createFolderPayloadReader([])).toThrow(RangeError);
  });

  it('reads files in order and reports the index of each read', async () => {
    const reader = createFolderPayloadReader([
      makeFile('a.hex', '01'),
      makeFile('b.hex', '02'),
      makeFile('c.hex', '03'),
    ]);
    const r1 = await reader.next();
    const r2 = await reader.next();
    const r3 = await reader.next();
    expect(r1).toEqual({ bytes: new Uint8Array([0x01]), index: 0 });
    expect(r2).toEqual({ bytes: new Uint8Array([0x02]), index: 1 });
    expect(r3).toEqual({ bytes: new Uint8Array([0x03]), index: 2 });
  });

  it('wraps back to the first file after the last', async () => {
    const reader = createFolderPayloadReader([
      makeFile('a.hex', 'AA'),
      makeFile('b.hex', 'BB'),
    ]);
    await reader.next(); // a
    await reader.next(); // b
    const wrapped = await reader.next();
    expect(wrapped.index).toBe(0);
    expect(wrapped.bytes).toEqual(new Uint8Array([0xaa]));
  });

  it('reset() restarts the rotation from the first file', async () => {
    const reader = createFolderPayloadReader([
      makeFile('a.hex', 'AA'),
      makeFile('b.hex', 'BB'),
      makeFile('c.hex', 'CC'),
    ]);
    await reader.next();
    await reader.next();
    reader.reset();
    const r = await reader.next();
    expect(r.index).toBe(0);
  });

  it('reads fresh content on every use — no caching', async () => {
    const file = makeFile('a.hex', '01');
    const other = makeFile('b.hex', 'FF');
    const reader = createFolderPayloadReader([file, other]);

    const first = await reader.next();
    expect(first.bytes).toEqual(new Uint8Array([0x01]));

    // Simulate the file changing on disk between cycles
    file.setContent('02 03');
    await reader.next(); // b.hex
    const second = await reader.next(); // a.hex again
    expect(second.bytes).toEqual(new Uint8Array([0x02, 0x03]));

    // text() called once per read of this file — never served from cache
    expect(file.textSpy).toHaveBeenCalledTimes(2);
  });

  it('parses hex with spaces, colons, and mixed case', async () => {
    const reader = createFolderPayloadReader([makeFile('a.hex', 'de:AD be ef')]);
    const { bytes } = await reader.next();
    expect(bytes).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  });

  it('trims surrounding whitespace and newlines', async () => {
    const reader = createFolderPayloadReader([makeFile('a.hex', '  0A 0B\n')]);
    const { bytes } = await reader.next();
    expect(bytes).toEqual(new Uint8Array([0x0a, 0x0b]));
  });

  it('invalid hex yields empty bytes rather than throwing', async () => {
    const reader = createFolderPayloadReader([makeFile('bad.hex', 'ZZ QQ')]);
    const { bytes } = await reader.next();
    expect(bytes).toEqual(new Uint8Array(0));
  });

  it('empty file yields empty bytes', async () => {
    const reader = createFolderPayloadReader([makeFile('empty.hex', '')]);
    const { bytes } = await reader.next();
    expect(bytes).toEqual(new Uint8Array(0));
  });

  it('a rejected read propagates to the caller', async () => {
    const failing: PayloadFileLike = {
      name: 'gone.hex',
      text: () => Promise.reject(new Error('file deleted')),
    };
    const reader = createFolderPayloadReader([failing]);
    await expect(reader.next()).rejects.toThrow('file deleted');
  });

  it('length reflects the number of files', () => {
    const reader = createFolderPayloadReader([makeFile('a', ''), makeFile('b', '')]);
    expect(reader.length).toBe(2);
  });
});
