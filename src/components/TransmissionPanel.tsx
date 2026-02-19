import { useState } from 'react';
import type { TransmissionConfig, TransmissionStats, WsStatus } from '../types';

interface Props {
  txConfig: TransmissionConfig;
  stats: TransmissionStats;
  wsStatus: WsStatus;
  isRunning: boolean;
  lastError: string | null;
  onConfigChange: (patch: Partial<TransmissionConfig>) => void;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
}

function StatusDot({ status }: { status: WsStatus }) {
  const colors: Record<WsStatus, string> = {
    connected: 'bg-emerald-400',
    connecting: 'bg-amber-400',
    disconnected: 'bg-slate-600',
    error: 'bg-red-500',
  };
  const labels: Record<WsStatus, string> = {
    connected: 'Connected',
    connecting: 'Connecting…',
    disconnected: 'Disconnected',
    error: 'Error',
  };
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-2 h-2 rounded-full ${colors[status]} ${status === 'connected' ? 'pulse-dot' : ''}`}
      />
      <span className={`text-xs uppercase tracking-wider ${status === 'connected' ? 'text-emerald-400' : status === 'error' ? 'text-red-400' : 'text-slate-500'}`}>
        {labels[status]}
      </span>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function TransmissionPanel({
  txConfig,
  stats,
  wsStatus,
  isRunning,
  lastError,
  onConfigChange,
  onStart,
  onStop,
  onReset,
}: Props) {
  const [urlError, setUrlError] = useState<string | null>(null);

  const validateUrl = (url: string): boolean => {
    try {
      const u = new URL(url);
      if (u.protocol !== 'ws:' && u.protocol !== 'wss:') {
        setUrlError('URL must use ws:// or wss://');
        return false;
      }
      setUrlError(null);
      return true;
    } catch {
      setUrlError('Invalid WebSocket URL');
      return false;
    }
  };

  const handleStart = () => {
    if (!validateUrl(txConfig.wsUrl)) return;
    onStart();
  };

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-header flex items-center justify-between">
        <span>Transmission</span>
        <StatusDot status={wsStatus} />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* WebSocket URL */}
        <div>
          <label className="field-label">WebSocket URL</label>
          <input
            type="text"
            className={`field-input ${urlError ? 'border-red-500/70' : ''}`}
            placeholder="ws://localhost:8765"
            value={txConfig.wsUrl}
            disabled={isRunning}
            onChange={e => {
              onConfigChange({ wsUrl: e.target.value });
              validateUrl(e.target.value);
            }}
          />
          {urlError && <p className="text-xs text-red-400 mt-1">{urlError}</p>}
        </div>

        {/* Interval */}
        <div>
          <label className="field-label">Interval (seconds)</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              className="field-input"
              value={txConfig.intervalMs / 1000}
              min={0.05}
              max={3600}
              step={0.1}
              disabled={isRunning}
              onChange={e => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v >= 0.05) {
                  onConfigChange({ intervalMs: Math.round(v * 1000) });
                }
              }}
            />
            <span className="text-xs text-slate-500 whitespace-nowrap">
              {(1000 / txConfig.intervalMs).toFixed(2)} Hz
            </span>
          </div>
          {/* Presets */}
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {[0.1, 0.5, 1, 2, 5, 10].map(s => (
              <button
                key={s}
                className={`px-2 py-0.5 text-xs rounded border transition-colors cursor-pointer
                  ${txConfig.intervalMs === s * 1000
                    ? 'border-sky-500/60 text-sky-400 bg-sky-500/10'
                    : 'border-[#1a2438] text-slate-500 hover:border-sky-500/40 hover:text-sky-400'
                  }`}
                disabled={isRunning}
                onClick={() => onConfigChange({ intervalMs: s * 1000 })}
              >
                {s}s
              </button>
            ))}
          </div>
        </div>

        {/* Start / Stop */}
        <div className="pt-1">
          {isRunning ? (
            <button className="btn-stop" onClick={onStop}>
              ■ Stop
            </button>
          ) : (
            <button className="btn-start" onClick={handleStart}>
              ▶ Start
            </button>
          )}
        </div>

        {/* Error */}
        {lastError && (
          <div className="bg-red-900/20 border border-red-500/30 rounded p-3">
            <p className="text-xs text-red-400 break-all">{lastError}</p>
          </div>
        )}

        {/* Stats */}
        <div className="border-t border-[#1a2438] pt-4 space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-xs text-slate-600 uppercase tracking-widest">Statistics</p>
            <button
              className="text-xs text-slate-600 hover:text-slate-400 cursor-pointer transition-colors"
              onClick={onReset}
            >
              Reset
            </button>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div className="stat-block">
              <span className="stat-label">Frames Sent</span>
              <span className="stat-value">{stats.framesSent.toLocaleString()}</span>
            </div>
            <div className="stat-block">
              <span className="stat-label">Bytes Sent</span>
              <span className="stat-value">{formatBytes(stats.bytesSent)}</span>
            </div>
            <div className="stat-block">
              <span className="stat-label">MCFC</span>
              <span className="stat-value font-mono">
                {stats.mcfc.toString().padStart(3, '0')}
                <span className="text-xs text-slate-600 ml-1">/255</span>
              </span>
            </div>
            <div className="stat-block">
              <span className="stat-label">VCFC</span>
              <span className="stat-value font-mono">
                {stats.vcfc.toString().padStart(3, '0')}
                <span className="text-xs text-slate-600 ml-1">/255</span>
              </span>
            </div>
          </div>

          {stats.lastFrameTs && (
            <p className="text-xs text-slate-600">
              Last frame: {new Date(stats.lastFrameTs).toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
