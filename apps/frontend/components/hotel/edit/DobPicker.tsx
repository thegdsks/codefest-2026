'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { MONTHS } from '@/lib/hotel/edit-profile-options';

interface DobPickerProps {
  month: string;
  day: string;
  onChange: (month: string, day: string) => void;
}

export default function DobPicker({ month, day, onChange }: DobPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const formatted = month && day ? `${month}/${day}` : '';

  return (
    <div className="relative group text-left">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative w-full border border-gray-300 rounded-[8px] px-4 py-2.5 bg-[#f5f5f5] flex flex-col focus-within:border-black transition-colors cursor-pointer select-none text-left"
      >
        <span className="text-[10px] text-gray-400 font-sans uppercase font-bold tracking-widest mb-1 leading-none select-none">
          Date of Birth
        </span>
        <span className="text-gray-900 font-mono font-bold text-sm h-6 flex items-center select-none">
          {formatted}
        </span>
        <ChevronDown
          size={14}
          className="text-gray-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none"
        />
      </button>

      {isOpen && (
        <div className="absolute z-20 top-full mt-2 left-0 w-full sm:w-[320px] bg-white border border-gray-250/50 rounded-lg p-4 shadow-xl flex flex-col gap-4 animate-fade-in">
          <div className="flex justify-between items-center border-b border-gray-100 pb-2">
            <span className="text-[10px] font-sans font-bold uppercase tracking-widest text-[#775a19]">
              Select Month &amp; Day
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-[10px] font-sans font-bold text-black hover:text-[#775a19] uppercase tracking-wider"
            >
              Done
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] font-sans font-bold text-gray-400 uppercase tracking-widest">
                Month
              </span>
              <div className="max-h-40 overflow-y-auto border border-gray-100 rounded p-1 space-y-0.5">
                {MONTHS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => onChange(m.value, day)}
                    className={`w-full text-left text-xs px-2 py-1.5 rounded transition-all font-sans font-semibold ${
                      month === m.value
                        ? 'bg-[#ffdea5] text-[#261900]'
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    {m.value} - {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] font-sans font-bold text-gray-400 uppercase tracking-widest">
                Day
              </span>
              <div className="max-h-40 overflow-y-auto border border-gray-100 rounded p-1 space-y-0.5">
                {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')).map(
                  (dayVal) => (
                    <button
                      key={dayVal}
                      type="button"
                      onClick={() => onChange(month, dayVal)}
                      className={`w-full text-left text-xs px-2 py-1.5 rounded transition-all font-mono font-bold ${
                        day === dayVal
                          ? 'bg-[#ffdea5] text-[#261900]'
                          : 'hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      {dayVal}
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <p className="font-sans text-[11px] text-gray-500 mt-2 tracking-wide leading-relaxed">
        Date format is mm/dd. Once submitted, date of birth can only be changed by calling{' '}
        <span className="underline font-sans text-gray-700">customer support</span>.
      </p>
    </div>
  );
}
