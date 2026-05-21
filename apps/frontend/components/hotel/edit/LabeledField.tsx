'use client';

import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

const BOX =
  'relative border rounded-[8px] px-4 py-2.5 bg-white flex flex-col transition-colors focus-within:ring-1 focus-within:ring-black/10';
const LABEL = 'text-[10px] text-gray-400 font-sans uppercase font-bold tracking-widest mb-1';
const CONTROL =
  'w-full bg-transparent border-none p-0 text-gray-900 font-sans font-medium text-sm focus:ring-0 outline-none h-6 block';

interface LabeledInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  error?: string;
  errorIcon?: ReactNode;
}

export function LabeledInput({
  id,
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  placeholder,
  error,
  errorIcon,
}: LabeledInputProps) {
  return (
    <div
      className={`${BOX} ${error ? 'border-red-500' : 'border-gray-300 focus-within:border-black'}`}
    >
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className={CONTROL}
      />
      {error && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-red-600 bg-white pl-2">
          {errorIcon}
          <span className="text-[10px] font-sans font-bold uppercase tracking-wider">{error}</span>
        </div>
      )}
    </div>
  );
}

interface LabeledSelectProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}

export function LabeledSelect({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
}: LabeledSelectProps) {
  return (
    <div className={`${BOX} border-gray-300 focus-within:border-black font-sans`}>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <div className="relative flex items-center">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${CONTROL} appearance-none pr-8 cursor-pointer`}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="text-gray-400 absolute right-0 pointer-events-none" />
      </div>
    </div>
  );
}

export function toOptions(values: string[]): Array<{ value: string; label: string }> {
  return values.map((v) => ({ value: v, label: v }));
}
