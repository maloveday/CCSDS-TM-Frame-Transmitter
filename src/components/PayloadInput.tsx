import { useRef } from 'react';
import type { PayloadState, PayloadMode } from '../types';
import { hexToBytes, asciiToBytes, validateHexInput } from '../utils/hex';

interface Props {
  state: PayloadState;
  availableBytes: number;
  disabled: boolean;
  onChange: (state: PayloadState) => void;
}

export function PayloadInput({ state, availableBytes, disabled, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const setMode = (mode: PayloadMode) => {
    if (mode === state.mode) return;
    // When switching modes, clear the text but keep bytes if possible
    onChange({ ...state, mode, text: '', error: null, fileName: null });
  };

  const handleTextChange = (raw: string) => {
    if (state.mode === 'hex') {
      const err = validateHexInput(raw);
      if (err) {
        onChange({ ...state, text: raw, bytes: new Uint8Array(0), error: err, fileName: null });
        return;
      }
      const bytes = hexToBytes(raw) ?? new Uint8Array(0);
      onChange({ ...state, text: raw, bytes, error: null, fileName: null });
    } else {
      const bytes = asciiToBytes(raw);
      onChange({ ...state, text: raw, bytes, error: null, fileName: null });
    }
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const buf = reader.result as ArrayBuffer;
      const bytes = new Uint8Array(buf);
      // Display as hex
      const hex = Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0').toUpperCase())
        .join(' ');
      onChange({
        ...state,
        mode: 'hex',
        text: hex,
        bytes,
        error: null,
        fileName: file.name,
      });
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const payloadLen = state.bytes.length;
  const overLimit = payloadLen > availableBytes;
  const usage = availableBytes > 0 ? Math.min((payloadLen / availableBytes) * 100, 100) : 0;

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-header flex items-center justify-between">
        <span>Payload Data</span>
        {state.fileName && (
          <span className="text-xs text-slate-500 normal-case tracking-normal truncate max-w-[150px]">
            {state.fileName}
          </span>
        )}
      </div>

      <div className="flex-1 flex flex-col p-4 gap-3 min-h-0">
        {/* Mode selector */}
        <div className="flex gap-1 p-1 bg-[#080c14] rounded border border-[#1a2438]">
          {(['hex', 'ascii'] as PayloadMode[]).map(m => (
            <button
              key={m}
              onClick={() => !disabled && setMode(m)}
              disabled={disabled}
              className={`flex-1 py-1 text-xs uppercase tracking-wider rounded transition-colors cursor-pointer
                ${state.mode === m
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/50'
                  : 'text-slate-500 hover:text-slate-300 border border-transparent'
                }
              `}
            >
              {m}
            </button>
          ))}
          <button
            onClick={() => !disabled && fileRef.current?.click()}
            disabled={disabled}
            className="flex-1 py-1 text-xs uppercase tracking-wider rounded transition-colors cursor-pointer
              text-slate-500 hover:text-slate-300 border border-transparent hover:border-[#1a2438]"
          >
            File
          </button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>

        {/* Text area */}
        <div
          className="flex-1 relative"
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
        >
          <textarea
            className={`w-full h-full min-h-[120px] field-input resize-none font-mono text-xs leading-relaxed
              ${overLimit ? 'border-red-500/70 focus:border-red-500 focus:ring-red-500' : ''}
              ${state.mode === 'hex' ? 'text-emerald-300' : 'text-slate-200'}
            `}
            placeholder={
              state.mode === 'hex'
                ? 'DE AD BE EF 00 01 02 03 ...\n(space or colon separated hex bytes)\nor drag & drop a file'
                : 'Enter ASCII text payload...\nor drag & drop a file'
            }
            value={state.text}
            disabled={disabled}
            onChange={e => handleTextChange(e.target.value)}
            spellCheck={false}
          />
        </div>

        {/* Error */}
        {state.error && (
          <p className="text-xs text-red-400">{state.error}</p>
        )}

        {/* Usage bar */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className={overLimit ? 'text-red-400' : 'text-slate-500'}>
              {payloadLen} byte{payloadLen !== 1 ? 's' : ''} payload
            </span>
            <span className="text-slate-500">
              {availableBytes} bytes capacity
            </span>
          </div>
          <div className="h-1.5 bg-[#080c14] rounded-full border border-[#1a2438] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${overLimit ? 'bg-red-500' : 'bg-emerald-500'}`}
              style={{ width: `${usage}%` }}
            />
          </div>
          {overLimit && (
            <p className="text-xs text-red-400 mt-1">
              Payload truncated to {availableBytes} bytes — {payloadLen - availableBytes} bytes overflow
            </p>
          )}
          {!overLimit && payloadLen < availableBytes && payloadLen > 0 && (
            <p className="text-xs text-slate-600 mt-1">
              {availableBytes - payloadLen} bytes padded with idle fill
            </p>
          )}
        </div>

        {/* Quick fill helpers */}
        <div className="flex gap-2 flex-wrap">
          <button
            className="btn-ghost text-xs py-1"
            disabled={disabled}
            onClick={() => {
              const bytes = new Uint8Array(availableBytes).fill(0xE0);
              const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
              onChange({ ...state, mode: 'hex', text: hex, bytes, error: null, fileName: null });
            }}
          >
            Fill Idle (0xE0)
          </button>
          <button
            className="btn-ghost text-xs py-1"
            disabled={disabled}
            onClick={() => {
              const bytes = new Uint8Array(availableBytes).map((_, i) => i & 0xff);
              const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
              onChange({ ...state, mode: 'hex', text: hex, bytes, error: null, fileName: null });
            }}
          >
            Fill Ramp
          </button>
          <button
            className="btn-ghost text-xs py-1"
            disabled={disabled}
            onClick={() => onChange({ ...state, text: '', bytes: new Uint8Array(0), error: null, fileName: null })}
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
