import { useState } from 'react';
import type { FrameSection } from '../types';

interface Props {
  frame: Uint8Array;
  sections: FrameSection[];
  buildError: string | null;
}

const BYTES_PER_ROW = 16;

function getSectionForByte(offset: number, sections: FrameSection[]): FrameSection | null {
  return sections.find(s => offset >= s.start && offset < s.end) ?? null;
}

export function FramePreview({ frame, sections, buildError }: Props) {
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);

  if (buildError) {
    return (
      <div className="panel">
        <div className="panel-header">Frame Preview</div>
        <div className="p-4">
          <p className="text-sm text-red-400">{buildError}</p>
        </div>
      </div>
    );
  }

  if (frame.length === 0) {
    return (
      <div className="panel">
        <div className="panel-header">Frame Preview</div>
        <div className="p-4 text-slate-600 text-sm">No frame to display</div>
      </div>
    );
  }

  const rows: number[][] = [];
  for (let i = 0; i < frame.length; i += BYTES_PER_ROW) {
    rows.push(Array.from(frame.slice(i, i + BYTES_PER_ROW)));
  }

  return (
    <div className="panel">
      <div className="panel-header flex items-center justify-between">
        <span>Frame Preview</span>
        <span className="text-slate-500 normal-case tracking-normal text-xs">
          {frame.length} bytes total
        </span>
      </div>

      {/* Section legend */}
      <div className="flex flex-wrap gap-2 px-4 pt-3 pb-2 border-b border-[#1a2438]">
        {sections.map(s => (
          <button
            key={s.label}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs cursor-pointer transition-opacity border border-transparent
              ${hoveredSection === s.label ? 'border-white/20 opacity-100' : 'opacity-70 hover:opacity-100'}`}
            onMouseEnter={() => setHoveredSection(s.label)}
            onMouseLeave={() => setHoveredSection(null)}
          >
            <span className={`w-2.5 h-2.5 rounded-sm ${s.color.replace('/60', '')}`} />
            <span className={s.textColor}>{s.label}</span>
            <span className="text-slate-600">({s.end - s.start}B)</span>
          </button>
        ))}
      </div>

      {/* Hex dump */}
      <div className="p-4 overflow-x-auto">
        <table className="text-xs font-mono border-collapse w-full">
          <thead>
            <tr className="text-slate-600">
              <td className="pr-4 pb-1 text-right w-12">Offset</td>
              <td className="pb-1 pr-2">
                {Array.from({ length: BYTES_PER_ROW }, (_, i) => (
                  <span key={i} className="inline-block w-7 text-center">{i.toString(16).toUpperCase()}</span>
                ))}
              </td>
              <td className="pb-1 pl-2 border-l border-[#1a2438]">ASCII</td>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => {
              const baseOffset = rowIdx * BYTES_PER_ROW;
              return (
                <tr key={rowIdx} className="hover:bg-white/[0.02]">
                  {/* Offset */}
                  <td className="pr-4 text-right text-slate-600 select-none align-top">
                    {(baseOffset).toString(16).padStart(4, '0').toUpperCase()}
                  </td>

                  {/* Hex bytes */}
                  <td className="pr-2 align-top">
                    {row.map((byte, colIdx) => {
                      const globalOffset = baseOffset + colIdx;
                      const sec = getSectionForByte(globalOffset, sections);
                      const isHovered = sec?.label === hoveredSection;
                      return (
                        <span
                          key={colIdx}
                          className={`inline-block w-7 text-center rounded-sm transition-colors
                            ${sec ? sec.textColor : 'text-slate-400'}
                            ${isHovered ? sec!.color + ' ring-1 ring-white/10' : ''}
                            ${colIdx === 7 ? 'mr-2' : ''}
                          `}
                          onMouseEnter={() => sec && setHoveredSection(sec.label)}
                          onMouseLeave={() => setHoveredSection(null)}
                          title={sec ? `${sec.label} [offset ${globalOffset}]` : `[offset ${globalOffset}]`}
                        >
                          {byte.toString(16).padStart(2, '0').toUpperCase()}
                        </span>
                      );
                    })}
                    {/* Pad incomplete last row */}
                    {row.length < BYTES_PER_ROW &&
                      Array.from({ length: BYTES_PER_ROW - row.length }, (_, i) => (
                        <span key={`pad-${i}`} className="inline-block w-7" />
                      ))
                    }
                  </td>

                  {/* ASCII column */}
                  <td className="pl-2 border-l border-[#1a2438] text-slate-500 align-top select-none whitespace-nowrap">
                    {row.map((byte, colIdx) => {
                      const globalOffset = baseOffset + colIdx;
                      const sec = getSectionForByte(globalOffset, sections);
                      const char = byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '·';
                      return (
                        <span
                          key={colIdx}
                          className={`${sec ? sec.textColor + '/70' : 'text-slate-600'} cursor-default`}
                          onMouseEnter={() => sec && setHoveredSection(sec.label)}
                          onMouseLeave={() => setHoveredSection(null)}
                        >
                          {char}
                        </span>
                      );
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Section byte ranges */}
      <div className="px-4 pb-3 border-t border-[#1a2438] pt-3 grid grid-cols-2 gap-x-6 gap-y-1">
        {sections.map(s => (
          <div key={s.label} className="flex justify-between text-xs">
            <span className={s.textColor}>{s.label}</span>
            <span className="text-slate-600">
              [{s.start.toString(16).padStart(2, '0').toUpperCase()}h–{(s.end - 1).toString(16).padStart(2, '0').toUpperCase()}h]
              &nbsp;{s.end - s.start}B
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
