import { useEffect, useRef } from 'react';
import type { FolderPayloadState, PayloadState, PayloadMode } from '../types';
import { hexToBytes, asciiToBytes, validateHexInput } from '../utils/hex';
import { filterTopLevelFiles, sortPayloadFiles } from '../utils/folderPayload';

interface Props {
  state: PayloadState;
  availableBytes: number;
  disabled: boolean;
  onChange: (state: PayloadState) => void;
  folderState: FolderPayloadState;
  onFolderChange: (state: FolderPayloadState) => void;
}

export function PayloadInput({
  state,
  availableBytes,
  disabled,
  onChange,
  folderState,
  onFolderChange,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // webkitdirectory is non-standard and must be set imperatively
  useEffect(() => {
    folderInputRef.current?.setAttribute('webkitdirectory', '');
  }, []);

  const setMode = (mode: PayloadMode) => {
    if (mode === state.mode) return;
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
      const hex = Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0').toUpperCase())
        .join(' ');
      onChange({ ...state, mode: 'hex', text: hex, bytes, error: null, fileName: file.name });
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleFolderInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const allFiles = Array.from(fileList);
    const dirName = allFiles[0]?.webkitRelativePath.split('/')[0] ?? null;

    // Direct children only, in alphanumeric transmission order
    const topLevel = sortPayloadFiles(filterTopLevelFiles(allFiles));

    if (topLevel.length < 2) {
      onFolderChange({
        enabled: false,
        dirName,
        files: [],
        currentIndex: 0,
        error: `Folder must contain at least 2 files (found ${topLevel.length})`,
      });
      e.target.value = '';
      return;
    }

    onFolderChange({ enabled: true, dirName, files: topLevel, currentIndex: 0, error: null });
    e.target.value = ''; // allow re-selecting the same folder
  };

  const payloadLen = state.bytes.length;
  const overLimit = payloadLen > availableBytes;
  const usage = availableBytes > 0 ? Math.min((payloadLen / availableBytes) * 100, 100) : 0;

  const folderActive = folderState.enabled && folderState.files.length >= 2;

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-header flex items-center justify-between">
        <span>Payload Data</span>
        {state.fileName && !folderActive && (
          <span className="text-xs text-slate-500 normal-case tracking-normal truncate max-w-[150px]">
            {state.fileName}
          </span>
        )}
        {folderActive && (
          <span className="text-xs text-violet-400 normal-case tracking-normal">
            FOLDER MODE
          </span>
        )}
      </div>

      <div className="flex-1 flex flex-col p-4 gap-3 min-h-0 overflow-y-auto">
        {/* Mode selector */}
        <div className="flex gap-1 p-1 bg-[#080c14] rounded border border-[#1a2438]">
          {(['hex', 'ascii'] as PayloadMode[]).map(m => (
            <button
              key={m}
              onClick={() => !disabled && setMode(m)}
              disabled={disabled}
              className={`flex-1 py-1 text-xs uppercase tracking-wider rounded transition-colors cursor-pointer
                ${state.mode === m && !folderActive
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

        {/* Text area — shown in non-folder mode, dimmed in folder mode */}
        <div
          className={`flex-1 relative transition-opacity ${folderActive ? 'opacity-30 pointer-events-none' : ''}`}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
        >
          <textarea
            className={`w-full h-full min-h-[80px] field-input resize-none font-mono text-xs leading-relaxed
              ${overLimit ? 'border-red-500/70 focus:border-red-500 focus:ring-red-500' : ''}
              ${state.mode === 'hex' ? 'text-emerald-300' : 'text-slate-200'}
            `}
            placeholder={
              state.mode === 'hex'
                ? 'DE AD BE EF 00 01 02 03 ...\n(space or colon separated hex bytes)\nor drag & drop a file'
                : 'Enter ASCII text payload...\nor drag & drop a file'
            }
            value={state.text}
            disabled={disabled || folderActive}
            onChange={e => handleTextChange(e.target.value)}
            spellCheck={false}
          />
        </div>

        {/* Error */}
        {state.error && !folderActive && (
          <p className="text-xs text-red-400">{state.error}</p>
        )}

        {/* Usage bar */}
        {!folderActive && (
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
        )}

        {/* Quick fill helpers */}
        {!folderActive && (
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
        )}

        {/* ── Folder Rotation ─────────────────────────────────────── */}
        <section>
          <p className="text-xs text-slate-600 uppercase tracking-widest mb-3 border-t border-[#1a2438] pt-3">
            Folder Rotation
          </p>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button
                className="btn-ghost text-xs py-1 px-3 shrink-0"
                disabled={disabled}
                onClick={() => folderInputRef.current?.click()}
              >
                Select Folder
              </button>
              <input
                ref={folderInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFolderInput}
              />

              {folderState.files.length >= 2 && (
                /* Enabled / disabled toggle */
                <label className={`flex items-center gap-1.5 cursor-pointer select-none ml-auto ${disabled ? 'opacity-40' : ''}`}>
                  <div
                    className={`relative w-8 h-4 rounded-full transition-colors ${folderState.enabled ? 'bg-violet-500' : 'bg-[#1a2438]'}`}
                    onClick={() => !disabled && onFolderChange({ ...folderState, enabled: !folderState.enabled })}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${folderState.enabled ? 'translate-x-4' : ''}`} />
                  </div>
                  <span className="text-xs text-slate-400 uppercase tracking-wider">
                    {folderState.enabled ? 'On' : 'Off'}
                  </span>
                </label>
              )}
            </div>

            {/* Error */}
            {folderState.error && (
              <p className="text-xs text-red-400">{folderState.error}</p>
            )}

            {/* File list */}
            {folderState.files.length >= 2 && (
              <div className="bg-[#080c14] border border-[#1a2438] rounded p-2 space-y-0.5 max-h-40 overflow-y-auto">
                <p className="text-xs text-slate-600 mb-1.5">
                  {folderState.dirName}/&nbsp;&middot;&nbsp;{folderState.files.length} files
                  {folderState.enabled && (
                    <span className="ml-2 text-violet-400">
                      — sending {folderState.currentIndex + 1}/{folderState.files.length}
                    </span>
                  )}
                </p>
                {folderState.files.map((file, i) => {
                  const isCurrent = folderState.enabled && i === folderState.currentIndex;
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-1.5 text-xs font-mono rounded px-1 py-0.5 transition-colors
                        ${isCurrent ? 'bg-violet-900/40 text-violet-300' : 'text-slate-500'}
                      `}
                    >
                      <span className="w-5 text-right shrink-0 text-slate-700 select-none">
                        {isCurrent ? '▶' : `${i + 1}.`}
                      </span>
                      <span className="truncate">{file.name}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {!folderState.files.length && !folderState.error && (
              <p className="text-xs text-slate-700">
                Select a folder with 2+ hex payload files. Files are read fresh on each frame send, cycling in alphanumeric order.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
