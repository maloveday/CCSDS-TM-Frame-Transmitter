// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTransmitter } from './useTransmitter';
import type { FrameConfig, TransmissionConfig } from '../types';

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];
  static throwOnConstruct = false;

  url: string;
  binaryType = 'blob';
  readyState = MockWebSocket.CONNECTING;
  sent: ArrayBuffer[] = [];
  onopen: (() => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: (() => void) | null = null;

  constructor(url: string) {
    if (MockWebSocket.throwOnConstruct) throw new Error('bad url');
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: ArrayBuffer) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }

  // Test helpers
  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }
  fail() {
    this.onerror?.();
  }
  serverClose(code = 1000, reason = '') {
    this.onclose?.({ code, reason });
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FRAME_CONFIG: FrameConfig = {
  scid: 1,
  vcid: 0,
  hasOCF: false,
  syncFlag: false,
  packetOrderFlag: false,
  segmentLengthId: 3,
  firstHeaderPointer: 0x7ff,
  frameLength: 16,
  hasSecondaryHeader: false,
  secondaryHeaderData: '',
  ocfData: '',
  hasFECF: false,
  idleFillByte: 0xe0,
  hasCADU: false,
  caduRandomize: false,
  caduPayloadType: 'transfer-frame',
  rsVariant: 'RS_255_223',
  rsInterleaveDepth: 1,
  caduCodewordData: '',
};

const TX_CONFIG: TransmissionConfig = { wsUrl: 'ws://test:1234', intervalMs: 1000 };

const staticPayload = (bytes = new Uint8Array([0x01, 0x02])) =>
  vi.fn(async () => bytes);

function lastSocket(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1];
}

beforeEach(() => {
  vi.useFakeTimers();
  MockWebSocket.instances = [];
  MockWebSocket.throwOnConstruct = false;
  vi.stubGlobal('WebSocket', MockWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Connection lifecycle
// ---------------------------------------------------------------------------

describe('useTransmitter – connection lifecycle', () => {
  it('starts in disconnected state', () => {
    const { result } = renderHook(() => useTransmitter());
    expect(result.current.wsStatus).toBe('disconnected');
    expect(result.current.isRunning).toBe(false);
  });

  it('transitions connecting → connected and sends the first frame on open', async () => {
    const { result } = renderHook(() => useTransmitter());

    act(() => {
      result.current.start(FRAME_CONFIG, TX_CONFIG, staticPayload());
    });
    expect(result.current.wsStatus).toBe('connecting');
    expect(result.current.isRunning).toBe(true);

    await act(async () => {
      lastSocket().open();
    });
    expect(result.current.wsStatus).toBe('connected');
    expect(lastSocket().sent.length).toBe(1);
    expect(result.current.stats.framesSent).toBe(1);
  });

  it('reports error status when the constructor throws', () => {
    MockWebSocket.throwOnConstruct = true;
    const { result } = renderHook(() => useTransmitter());
    act(() => {
      result.current.start(FRAME_CONFIG, TX_CONFIG, staticPayload());
    });
    expect(result.current.wsStatus).toBe('error');
    expect(result.current.isRunning).toBe(false);
    expect(result.current.lastError).toMatch(/WebSocket error/);
  });

  it("onerror ends the run with wsStatus 'error', not 'disconnected'", async () => {
    const { result } = renderHook(() => useTransmitter());
    act(() => {
      result.current.start(FRAME_CONFIG, TX_CONFIG, staticPayload());
    });
    await act(async () => {
      lastSocket().fail();
    });
    expect(result.current.wsStatus).toBe('error');
    expect(result.current.isRunning).toBe(false);
    expect(result.current.lastError).toBe('WebSocket connection error');
  });

  it('abnormal server close sets an error message and stops', async () => {
    const { result } = renderHook(() => useTransmitter());
    act(() => {
      result.current.start(FRAME_CONFIG, TX_CONFIG, staticPayload());
    });
    await act(async () => {
      lastSocket().open();
      lastSocket().serverClose(1006, 'abnormal');
    });
    expect(result.current.isRunning).toBe(false);
    expect(result.current.lastError).toMatch(/code=1006/);
  });

  it('stop() halts transmission and returns to disconnected', async () => {
    const { result } = renderHook(() => useTransmitter());
    act(() => {
      result.current.start(FRAME_CONFIG, TX_CONFIG, staticPayload());
    });
    await act(async () => {
      lastSocket().open();
    });
    act(() => {
      result.current.stop();
    });
    expect(result.current.isRunning).toBe(false);
    expect(result.current.wsStatus).toBe('disconnected');

    // No further frames after stop, even as timers advance
    const sentBefore = lastSocket().sent.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(lastSocket().sent.length).toBe(sentBefore);
  });
});

// ---------------------------------------------------------------------------
// Interval sending and stats
// ---------------------------------------------------------------------------

describe('useTransmitter – interval sending', () => {
  it('sends one frame per interval tick', async () => {
    const { result } = renderHook(() => useTransmitter());
    act(() => {
      result.current.start(FRAME_CONFIG, TX_CONFIG, staticPayload());
    });
    await act(async () => {
      lastSocket().open();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    // 1 immediate + 3 interval ticks
    expect(lastSocket().sent.length).toBe(4);
    expect(result.current.stats.framesSent).toBe(4);
  });

  it('accumulates bytesSent from the actual frames on the wire', async () => {
    const { result } = renderHook(() => useTransmitter());
    act(() => {
      result.current.start(FRAME_CONFIG, TX_CONFIG, staticPayload());
    });
    await act(async () => {
      lastSocket().open();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    // frameLength=16, 2 frames
    expect(result.current.stats.bytesSent).toBe(32);
  });

  it('increments MCFC/VCFC per frame', async () => {
    const { result } = renderHook(() => useTransmitter());
    act(() => {
      result.current.start(FRAME_CONFIG, TX_CONFIG, staticPayload());
    });
    await act(async () => {
      lastSocket().open();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.stats.mcfc).toBe(3);
    expect(result.current.stats.vcfc).toBe(3);
  });

  it('calls getPayload once per frame — payload is read fresh every send', async () => {
    const getPayload = staticPayload();
    const { result } = renderHook(() => useTransmitter());
    act(() => {
      result.current.start(FRAME_CONFIG, TX_CONFIG, getPayload);
    });
    await act(async () => {
      lastSocket().open();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(getPayload).toHaveBeenCalledTimes(3);
  });

  it('exposes the sent frame via lastFrame', async () => {
    const { result } = renderHook(() => useTransmitter());
    act(() => {
      result.current.start(FRAME_CONFIG, TX_CONFIG, staticPayload(new Uint8Array([0xab])));
    });
    await act(async () => {
      lastSocket().open();
    });
    expect(result.current.lastFrame).not.toBeNull();
    expect(result.current.lastFrame!.length).toBe(16);
    // Payload byte lands at offset 6 (after primary header)
    expect(result.current.lastFrame![6]).toBe(0xab);
  });
});

// ---------------------------------------------------------------------------
// Async payload behaviour
// ---------------------------------------------------------------------------

describe('useTransmitter – async payload', () => {
  it('a slow getPayload spanning interval ticks does not produce concurrent sends', async () => {
    let release: (b: Uint8Array) => void = () => {};
    const slow = vi.fn(
      () => new Promise<Uint8Array>(resolve => { release = resolve; }),
    );
    const { result } = renderHook(() => useTransmitter());
    act(() => {
      result.current.start(FRAME_CONFIG, TX_CONFIG, slow);
    });
    await act(async () => {
      lastSocket().open();
    });
    // First send is awaiting getPayload; let 3 interval ticks elapse
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    // The in-progress guard must have blocked the ticks from re-entering
    expect(slow).toHaveBeenCalledTimes(1);
    expect(lastSocket().sent.length).toBe(0);

    // Resolve the read → exactly one frame goes out
    await act(async () => {
      release(new Uint8Array([0x01]));
      await Promise.resolve();
    });
    expect(lastSocket().sent.length).toBe(1);
  });

  it('stopping while a payload read is in flight suppresses the send', async () => {
    let release: (b: Uint8Array) => void = () => {};
    const slow = vi.fn(
      () => new Promise<Uint8Array>(resolve => { release = resolve; }),
    );
    const { result } = renderHook(() => useTransmitter());
    act(() => {
      result.current.start(FRAME_CONFIG, TX_CONFIG, slow);
    });
    await act(async () => {
      lastSocket().open();
    });

    const socket = lastSocket();
    act(() => {
      result.current.stop();
    });
    await act(async () => {
      release(new Uint8Array([0x01]));
      await Promise.resolve();
    });
    expect(socket.sent.length).toBe(0);
  });

  it('a rejected getPayload stops transmission with a payload error', async () => {
    const failing = vi.fn(() => Promise.reject(new Error('file deleted')));
    const { result } = renderHook(() => useTransmitter());
    act(() => {
      result.current.start(FRAME_CONFIG, TX_CONFIG, failing);
    });
    await act(async () => {
      lastSocket().open();
    });
    expect(result.current.lastError).toMatch(/Payload read error: file deleted/);
    expect(result.current.isRunning).toBe(false);
  });

  it('an invalid frame config stops transmission with the build error', async () => {
    const badConfig = { ...FRAME_CONFIG, frameLength: 3 }; // below minimum of 7
    const { result } = renderHook(() => useTransmitter());
    act(() => {
      result.current.start(badConfig, TX_CONFIG, staticPayload());
    });
    await act(async () => {
      lastSocket().open();
    });
    expect(result.current.lastError).toMatch(/Frame length/);
    expect(result.current.isRunning).toBe(false);
    expect(lastSocket().sent.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// resetStats
// ---------------------------------------------------------------------------

describe('useTransmitter – resetStats', () => {
  it('clears stats, lastFrame and lastError', async () => {
    const { result } = renderHook(() => useTransmitter());
    act(() => {
      result.current.start(FRAME_CONFIG, TX_CONFIG, staticPayload());
    });
    await act(async () => {
      lastSocket().open();
    });
    act(() => {
      result.current.stop();
    });
    act(() => {
      result.current.resetStats();
    });
    expect(result.current.stats.framesSent).toBe(0);
    expect(result.current.stats.bytesSent).toBe(0);
    expect(result.current.lastFrame).toBeNull();
    expect(result.current.lastError).toBeNull();
  });
});
