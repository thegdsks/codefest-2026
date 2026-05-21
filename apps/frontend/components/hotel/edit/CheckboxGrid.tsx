'use client';

interface CheckboxGridProps {
  options: string[];
  selected: string[];
  onToggle: (option: string) => void;
  size?: 'sm' | 'md';
  containerClassName?: string;
}

const DEFAULT_CONTAINER = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-3 gap-x-4';

export default function CheckboxGrid({
  options,
  selected,
  onToggle,
  size = 'sm',
  containerClassName = DEFAULT_CONTAINER,
}: CheckboxGridProps) {
  const labelClass =
    size === 'md'
      ? 'flex items-center gap-3 cursor-pointer group select-none text-sm font-sans text-black font-bold'
      : 'flex items-start gap-2.5 cursor-pointer group select-none text-[13px] font-sans text-gray-800 font-medium';
  const boxBase = size === 'md' ? 'w-5 h-5 rounded-[4px]' : 'w-4 h-4 mt-0.5 rounded-[2px]';

  return (
    <div className={containerClassName}>
      {options.map((opt) => {
        const isChecked = selected.includes(opt);
        return (
          <label key={opt} className={labelClass}>
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => onToggle(opt)}
              className="sr-only"
            />
            <span
              className={`${boxBase} border flex items-center justify-center transition-all shrink-0 ${
                isChecked
                  ? 'border-black bg-black text-white'
                  : 'border-gray-300 bg-white group-hover:border-black'
              }`}
            >
              {isChecked && (
                <svg
                  className="w-3 h-3 text-white fill-current"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <path d="M0 11l2-2 5 5L18 3l2 2L7 18z" />
                </svg>
              )}
            </span>
            <span>{opt}</span>
          </label>
        );
      })}
    </div>
  );
}
