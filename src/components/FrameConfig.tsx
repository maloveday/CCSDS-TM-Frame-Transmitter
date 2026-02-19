import type { FrameConfig } from '../types';
import { FHP_IDLE, FHP_NO_PACKET, availableDataBytes } from '../utils/frameBuilder';

interface Props {
  config: FrameConfig;
  onChange: (patch: Partial<FrameConfig>) => void;
  disabled: boolean;
}

function NumericField({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
  hint,
  width = 'w-full',
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (v: number) => void;
  hint?: string;
  width?: string;
}) {
  return (
    <div>
      <label className="field-label">
        {label}
        {hint && <span className="ml-1 text-slate-600 normal-case tracking-normal">{hint}</span>}
      </label>
      <input
        type="number"
        className={`field-input ${width}`}
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={e => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
      />
    </div>
  );
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={`flex items-center gap-2 cursor-pointer select-none ${disabled ? 'opacity-40' : ''}`}>
      <div
        className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-sky-500' : 'bg-[#1a2438]'}`}
        onClick={() => !disabled && onChange(!checked)}
      >
        <div
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`}
        />
      </div>
      <span className="text-xs text-slate-300 uppercase tracking-wider">{label}</span>
    </label>
  );
}

export function FrameConfig({ config, onChange, disabled }: Props) {
  const available = availableDataBytes(config);

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-header flex items-center justify-between">
        <span>Frame Configuration</span>
        <span className="text-sky-400 normal-case tracking-normal">CCSDS 132.0-B-3</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* Primary Header Fields */}
        <section>
          <p className="text-xs text-slate-600 uppercase tracking-widest mb-3 border-b border-[#1a2438] pb-1">
            Primary Header
          </p>
          <div className="grid grid-cols-2 gap-3">
            <NumericField
              label="SCID"
              hint="(0–1023)"
              value={config.scid}
              min={0}
              max={1023}
              disabled={disabled}
              onChange={v => onChange({ scid: v })}
            />
            <NumericField
              label="VCID"
              hint="(0–7)"
              value={config.vcid}
              min={0}
              max={7}
              disabled={disabled}
              onChange={v => onChange({ vcid: v })}
            />
          </div>

          <div className="mt-3">
            <NumericField
              label="Frame Length"
              hint="(7–2048 bytes)"
              value={config.frameLength}
              min={7}
              max={2048}
              disabled={disabled}
              onChange={v => onChange({ frameLength: v })}
            />
            <div className="mt-1 text-xs text-slate-500">
              Data field: <span className="text-emerald-400">{available}</span> bytes available
            </div>
          </div>
        </section>

        {/* Sync / Segmentation */}
        <section>
          <p className="text-xs text-slate-600 uppercase tracking-widest mb-3 border-b border-[#1a2438] pb-1">
            Sync &amp; Segmentation
          </p>
          <div className="space-y-2.5">
            <Toggle
              label="Synchronization Flag"
              checked={config.syncFlag}
              disabled={disabled}
              onChange={v => onChange({ syncFlag: v })}
            />
            <Toggle
              label="Packet Order Flag"
              checked={config.packetOrderFlag}
              disabled={disabled || config.syncFlag}
              onChange={v => onChange({ packetOrderFlag: v })}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">Segment ID <span className="text-slate-600 normal-case">(0–3)</span></label>
                <select
                  className="field-input"
                  value={config.segmentLengthId}
                  disabled={disabled}
                  onChange={e => onChange({ segmentLengthId: parseInt(e.target.value) })}
                >
                  <option value={0}>0 – 256</option>
                  <option value={1}>1 – 512</option>
                  <option value={2}>2 – 1024</option>
                  <option value={3}>3 – Unsegmented</option>
                </select>
              </div>
              <div>
                <label className="field-label">First Header Ptr</label>
                <input
                  type="text"
                  className="field-input"
                  value={'0x' + config.firstHeaderPointer.toString(16).toUpperCase().padStart(3, '0')}
                  disabled={disabled}
                  onChange={e => {
                    const raw = e.target.value.replace(/^0x/i, '');
                    const v = parseInt(raw, 16);
                    if (!isNaN(v) && v >= 0 && v <= 0x7ff) onChange({ firstHeaderPointer: v });
                  }}
                />
                <div className="mt-0.5 text-xs text-slate-600">
                  0x7FE=idle · 0x7FF=no pkt
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-1">
              <button
                className="btn-ghost text-xs py-1"
                disabled={disabled}
                onClick={() => onChange({ firstHeaderPointer: FHP_IDLE })}
              >
                Set Idle
              </button>
              <button
                className="btn-ghost text-xs py-1"
                disabled={disabled}
                onClick={() => onChange({ firstHeaderPointer: FHP_NO_PACKET })}
              >
                No Packet
              </button>
              <button
                className="btn-ghost text-xs py-1"
                disabled={disabled}
                onClick={() => onChange({ firstHeaderPointer: 0 })}
              >
                Reset 0
              </button>
            </div>
          </div>
        </section>

        {/* Optional Fields */}
        <section>
          <p className="text-xs text-slate-600 uppercase tracking-widest mb-3 border-b border-[#1a2438] pb-1">
            Optional Fields
          </p>
          <div className="space-y-3">
            <div>
              <Toggle
                label="FECF — Frame Error Control (CRC-16)"
                checked={config.hasFECF}
                disabled={disabled}
                onChange={v => onChange({ hasFECF: v })}
              />
              {config.hasFECF && (
                <p className="text-xs text-slate-600 mt-1 ml-11">CRC-16/CCITT-FALSE, 2 bytes appended</p>
              )}
            </div>

            <div>
              <Toggle
                label="OCF — Operational Control Field"
                checked={config.hasOCF}
                disabled={disabled}
                onChange={v => onChange({ hasOCF: v })}
              />
              {config.hasOCF && (
                <div className="mt-2 ml-11">
                  <label className="field-label">OCF Data (4 bytes hex)</label>
                  <input
                    type="text"
                    className="field-input text-amber-300"
                    placeholder="00 00 00 00"
                    value={config.ocfData}
                    disabled={disabled}
                    onChange={e => onChange({ ocfData: e.target.value })}
                  />
                </div>
              )}
            </div>

            <div>
              <Toggle
                label="Secondary Header"
                checked={config.hasSecondaryHeader}
                disabled={disabled}
                onChange={v => onChange({ hasSecondaryHeader: v })}
              />
              {config.hasSecondaryHeader && (
                <div className="mt-2 ml-11">
                  <label className="field-label">SH Data Field (hex, 1–63 bytes)</label>
                  <input
                    type="text"
                    className="field-input text-purple-300"
                    placeholder="01 02 03 ..."
                    value={config.secondaryHeaderData}
                    disabled={disabled}
                    onChange={e => onChange({ secondaryHeaderData: e.target.value })}
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Idle Fill */}
        <section>
          <p className="text-xs text-slate-600 uppercase tracking-widest mb-3 border-b border-[#1a2438] pb-1">
            Idle Fill
          </p>
          <div>
            <label className="field-label">Fill Byte (hex)</label>
            <input
              type="text"
              className="field-input w-24"
              placeholder="E0"
              value={config.idleFillByte.toString(16).toUpperCase().padStart(2, '0')}
              disabled={disabled}
              onChange={e => {
                const v = parseInt(e.target.value, 16);
                if (!isNaN(v) && v >= 0 && v <= 0xff) onChange({ idleFillByte: v });
              }}
            />
            <p className="text-xs text-slate-600 mt-1">Fills unused data field space (default 0xE0 per CCSDS)</p>
          </div>
        </section>

      </div>
    </div>
  );
}
