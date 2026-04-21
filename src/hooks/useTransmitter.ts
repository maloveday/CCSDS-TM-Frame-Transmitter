import { useCallback, useEffect, useRef, useState } from 'react';
import type { FrameConfig, TransmissionConfig, TransmissionStats, WsStatus } from '../types';
import { buildTMFrame } from '../utils/frameBuilder';
import { buildCADU } from '../utils/cadu';

interface UseTransmitterReturn {
  isRunning: boolean;
  wsStatus: WsStatus;
  stats: TransmissionStats;
  lastFrame: Uint8Array | null;
  lastError: string | null;
  start: (frameConfig: FrameConfig, txConfig: TransmissionConfig, payload: Uint8Array) => void;
  stop: (finalStatus?: WsStatus) => void;
  resetStats: () => void;
}

const INITIAL_STATS: TransmissionStats = {
  framesSent: 0,
  bytesSent: 0,
  mcfc: 0,
  vcfc: 0,
  lastFrameTs: null,
};

export function useTransmitter(): UseTransmitterReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [wsStatus, setWsStatus] = useState<WsStatus>('disconnected');
  const [stats, setStats] = useState<TransmissionStats>(INITIAL_STATS);
  const [lastFrame, setLastFrame] = useState<Uint8Array | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statsRef = useRef<TransmissionStats>(INITIAL_STATS);
  const runningRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const closeSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.onopen = null;
      if (wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
  }, []);

  const stop = useCallback((finalStatus: WsStatus = 'disconnected') => {
    runningRef.current = false;
    clearTimer();
    closeSocket();
    setIsRunning(false);
    setWsStatus(finalStatus);
  }, [clearTimer, closeSocket]);

  const start = useCallback(
    (frameConfig: FrameConfig, txConfig: TransmissionConfig, payload: Uint8Array) => {
      if (runningRef.current) stop();

      setLastError(null);
      setWsStatus('connecting');
      setIsRunning(true);
      runningRef.current = true;

      let ws: WebSocket;
      try {
        ws = new WebSocket(txConfig.wsUrl);
        ws.binaryType = 'arraybuffer';
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setLastError(`WebSocket error: ${msg}`);
        setWsStatus('error');
        setIsRunning(false);
        runningRef.current = false;
        return;
      }

      wsRef.current = ws;

      ws.onopen = () => {
        if (!runningRef.current) return;
        setWsStatus('connected');

        const sendFrame = () => {
          if (!runningRef.current || ws.readyState !== WebSocket.OPEN) return;

          const currentStats = statsRef.current;
          const result = buildTMFrame(
            frameConfig,
            payload,
            currentStats.mcfc,
            currentStats.vcfc,
          );

          if (result.error) {
            setLastError(result.error);
            stop();
            return;
          }

          const frameToSend = frameConfig.hasCADU
            ? buildCADU(result.frame, frameConfig.caduRandomize).cadu
            : result.frame;

          try {
            ws.send(frameToSend.buffer);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setLastError(`Send error: ${msg}`);
            stop();
            return;
          }

          const newStats: TransmissionStats = {
            framesSent: currentStats.framesSent + 1,
            bytesSent: currentStats.bytesSent + frameToSend.length,
            mcfc: (currentStats.mcfc + 1) & 0xff,
            vcfc: (currentStats.vcfc + 1) & 0xff,
            lastFrameTs: Date.now(),
          };

          statsRef.current = newStats;
          setStats({ ...newStats });
          setLastFrame(frameToSend);
        };

        // Send first frame immediately
        sendFrame();

        // Then schedule at interval
        intervalRef.current = setInterval(sendFrame, txConfig.intervalMs);
      };

      ws.onerror = () => {
        if (!runningRef.current) return;
        setLastError('WebSocket connection error');
        stop('error');
      };

      ws.onclose = (ev) => {
        if (!runningRef.current) return;
        setWsStatus('disconnected');
        if (ev.code !== 1000) {
          setLastError(`WebSocket closed: code=${ev.code} ${ev.reason || ''}`);
        }
        stop();
      };
    },
    [stop],
  );

  const resetStats = useCallback(() => {
    statsRef.current = INITIAL_STATS;
    setStats(INITIAL_STATS);
    setLastFrame(null);
    setLastError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      runningRef.current = false;
      clearTimer();
      closeSocket();
    };
  }, [clearTimer, closeSocket]);

  return { isRunning, wsStatus, stats, lastFrame, lastError, start, stop, resetStats };
}
