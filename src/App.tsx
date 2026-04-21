import { useCallback, useMemo, useState } from 'react';
import type { FrameConfig, PayloadState, TransmissionConfig } from './types';
import { FrameConfig as FrameConfigPanel } from './components/FrameConfig';
import { PayloadInput } from './components/PayloadInput';
import { TransmissionPanel } from './components/TransmissionPanel';
import { FramePreview } from './components/FramePreview';
import { useTransmitter } from './hooks/useTransmitter';
import { availableDataBytes, buildTMFrame } from './utils/frameBuilder';
import { buildCADU } from './utils/cadu';

const DEFAULT_FRAME_CONFIG: FrameConfig = {
  scid: 1,
  vcid: 0,
  hasOCF: false,
  syncFlag: false,
  packetOrderFlag: false,
  segmentLengthId: 3,
  firstHeaderPointer: 0,
  frameLength: 512,
  hasSecondaryHeader: false,
  secondaryHeaderData: '',
  ocfData: '00 00 00 00',
  hasFECF: true,
  idleFillByte: 0xe0,
  hasCADU: false,
  caduRandomize: false,
};

const DEFAULT_TX_CONFIG: TransmissionConfig = {
  wsUrl: 'ws://localhost:8765',
  intervalMs: 1000,
};

const DEFAULT_PAYLOAD: PayloadState = {
  mode: 'hex',
  text: '',
  bytes: new Uint8Array(0),
  error: null,
  fileName: null,
};

export default function App() {
  const [frameConfig, setFrameConfig] = useState<FrameConfig>(DEFAULT_FRAME_CONFIG);
  const [txConfig, setTxConfig] = useState<TransmissionConfig>(DEFAULT_TX_CONFIG);
  const [payload, setPayload] = useState<PayloadState>(DEFAULT_PAYLOAD);

  const { isRunning, wsStatus, stats, lastFrame, lastError, start, stop, resetStats } =
    useTransmitter();

  const handleFrameConfigChange = useCallback((patch: Partial<FrameConfig>) => {
    setFrameConfig(prev => ({ ...prev, ...patch }));
  }, []);

  const handleTxConfigChange = useCallback((patch: Partial<TransmissionConfig>) => {
    setTxConfig(prev => ({ ...prev, ...patch }));
  }, []);

  const handleStart = useCallback(() => {
    start(frameConfig, txConfig, payload.bytes);
  }, [start, frameConfig, txConfig, payload.bytes]);

  const availableBytes = useMemo(() => availableDataBytes(frameConfig), [frameConfig]);

  // Build a preview frame (using current counters for live preview)
  const previewResult = useMemo(() => {
    return buildTMFrame(frameConfig, payload.bytes, stats.mcfc, stats.vcfc);
  }, [frameConfig, payload.bytes, stats.mcfc, stats.vcfc]);

  // Wrap in CADU if enabled (preview only — the transmitter handles its own wrapping)
  const displayResult = useMemo(() => {
    if (frameConfig.hasCADU && !previewResult.error) {
      const { cadu, sections } = buildCADU(previewResult.frame, frameConfig.caduRandomize, previewResult.sections);
      return { frame: cadu, sections, error: null };
    }
    return previewResult;
  }, [frameConfig.hasCADU, frameConfig.caduRandomize, previewResult]);

  // If running and we have a last transmitted frame, show that; otherwise show the built preview
  const displayFrame = lastFrame ?? displayResult.frame;
  const displaySections = displayResult.sections;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#080c14]">
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-[#1a2438] bg-[#0d1320] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-sky-400 pulse-dot" />
          <h1 className="text-sm font-semibold tracking-widest uppercase text-slate-200">
            CCSDS TM Frame Transmitter
          </h1>
        </div>
        <div className="flex items-center gap-5 text-xs text-slate-500">
          <span>SCID&nbsp;<span className="text-sky-400 font-bold">{frameConfig.scid}</span></span>
          <span>VCID&nbsp;<span className="text-sky-400 font-bold">{frameConfig.vcid}</span></span>
          <span>{frameConfig.frameLength}&nbsp;B&nbsp;frame</span>
          {frameConfig.hasFECF && <span className="text-red-400">FECF</span>}
          {frameConfig.hasOCF && <span className="text-amber-400">OCF</span>}
          {frameConfig.hasSecondaryHeader && <span className="text-purple-400">SH</span>}
          {frameConfig.hasCADU && <span className="text-orange-400">CADU{frameConfig.caduRandomize && '+PRBS'}</span>}
        </div>
      </header>

      {/* Main 3-column layout */}
      <div className="flex flex-1 gap-3 p-3 min-h-0 overflow-hidden">
        {/* Left: Frame Config */}
        <div className="w-72 shrink-0 overflow-hidden">
          <FrameConfigPanel
            config={frameConfig}
            onChange={handleFrameConfigChange}
            disabled={isRunning}
          />
        </div>

        {/* Center: Payload */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <PayloadInput
            state={payload}
            availableBytes={availableBytes}
            disabled={isRunning}
            onChange={setPayload}
          />
        </div>

        {/* Right: Transmission */}
        <div className="w-64 shrink-0 overflow-hidden">
          <TransmissionPanel
            txConfig={txConfig}
            stats={stats}
            wsStatus={wsStatus}
            isRunning={isRunning}
            lastError={lastError}
            onConfigChange={handleTxConfigChange}
            onStart={handleStart}
            onStop={stop}
            onReset={resetStats}
          />
        </div>
      </div>

      {/* Bottom: Frame Preview */}
      <div className="px-3 pb-3 shrink-0 max-h-[18rem] overflow-auto border-t border-[#1a2438]">
        <FramePreview
          frame={displayFrame}
          sections={displaySections}
          buildError={displayResult.error}
        />
      </div>
    </div>
  );
}
