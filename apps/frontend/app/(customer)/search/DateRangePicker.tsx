"use client"

import { Calendar, ChevronLeft, ChevronRight } from "lucide-react"
import { useEffect, useRef, useState } from "react"

// ── date helpers ──────────────────────────────────────────────────────────────

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

/** Monday-based offset: Mon=0 … Sun=6 */
function firstDayOffset(year: number, month: number) {
  return (new Date(year, month, 1).getDay() + 6) % 7
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(year, month + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() }
}

function formatRange(from: Date, to: Date | null): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
  const f = from.toLocaleDateString("en-US", opts)
  if (!to) return f
  return `${f} — ${to.toLocaleDateString("en-US", opts)}`
}

// ── types ─────────────────────────────────────────────────────────────────────

interface Range {
  from: Date | null
  to: Date | null
}

// ── MonthGrid ─────────────────────────────────────────────────────────────────

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]

function MonthGrid({
  year,
  month,
  range,
  hover,
  today,
  minDate,
  onDay,
  onHover,
}: {
  year: number
  month: number
  range: Range
  hover: Date | null
  today: Date
  minDate: Date
  onDay: (d: Date) => void
  onHover: (d: Date | null) => void
}) {
  const label = new Date(year, month).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })

  const count = daysInMonth(year, month)
  const offset = firstDayOffset(year, month)

  // effective range end — show hover preview before user picks second date
  const effectiveTo =
    range.from && !range.to && hover && hover > range.from ? hover : range.to

  const cells: Array<Date | null> = [
    ...Array(offset).fill(null),
    ...Array.from({ length: count }, (_, i) => new Date(year, month, i + 1)),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="select-none min-w-[252px]">
      <p className="text-center font-serif text-sm font-semibold text-black mb-3 px-8">
        {label}
      </p>

      <div className="grid grid-cols-7">
        {DAYS.map((d) => (
          <div
            key={d}
            className="h-9 w-9 flex items-center justify-center text-[10px] font-bold text-gray-400 uppercase tracking-wider"
          >
            {d}
          </div>
        ))}

        {cells.map((date, idx) => {
          if (!date) {
            return <div key={`e-${idx}`} className="h-9 w-9" />
          }

          const isPast = date < minDate && !sameDay(date, minDate)
          const isToday = sameDay(date, today)
          const isStart = range.from ? sameDay(date, range.from) : false
          const isEnd = effectiveTo ? sameDay(date, effectiveTo) : false
          const inBand =
            !!range.from &&
            !!effectiveTo &&
            date > range.from &&
            date < effectiveTo

          const hasBand =
            (isStart || isEnd || inBand) && !!range.from && !!effectiveTo
          const colInWeek = idx % 7

          // Cell carries the continuous band background
          let cellClass = "h-9 w-9"
          if (hasBand && !(isStart && isEnd)) {
            cellClass +=
              " bg-[#775a19]/10" +
              (isStart || colInWeek === 0 ? " rounded-l-full" : "") +
              (isEnd || colInWeek === 6 ? " rounded-r-full" : "")
          }

          // Button carries the circle (start/end) or is transparent (mid-range)
          let btnClass =
            "h-9 w-9 flex items-center justify-center text-sm rounded-full transition-colors focus:outline-none "

          if (isPast) {
            btnClass += "text-gray-300 cursor-default"
          } else if (isStart || isEnd) {
            btnClass += "bg-[#775a19] text-white font-medium cursor-pointer"
          } else if (isToday) {
            btnClass +=
              "ring-1 ring-[#775a19] text-[#775a19] font-semibold cursor-pointer hover:bg-[#775a19]/5"
          } else {
            btnClass += "text-gray-700 cursor-pointer hover:bg-gray-100"
          }

          return (
            <div key={date.toISOString()} className={cellClass}>
              <button
                type="button"
                disabled={isPast}
                className={btnClass}
                onClick={() => !isPast && onDay(date)}
                onMouseEnter={() => !isPast && onHover(date)}
                onMouseLeave={() => onHover(null)}
              >
                {date.getDate()}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── DateRangePicker ───────────────────────────────────────────────────────────

interface DateRangePickerProps {
  value: string
  onChange: (value: string) => void
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [open, setOpen] = useState(false)
  const [range, setRange] = useState<Range>({ from: null, to: null })
  const [hover, setHover] = useState<Date | null>(null)
  const [view, setView] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  })
  const containerRef = useRef<HTMLDivElement>(null)

  const nextView = shiftMonth(view.year, view.month, 1)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  function handleDay(date: Date) {
    // First click — or restarting after a complete range
    if (!range.from || (range.from && range.to)) {
      setRange({ from: date, to: null })
      return
    }
    // Second click — complete or swap
    if (sameDay(date, range.from)) return // ignore same-day click
    if (date < range.from) {
      setRange({ from: date, to: range.from })
    } else {
      setRange({ from: range.from, to: date })
    }
  }

  function handleConfirm() {
    if (range.from) {
      onChange(formatRange(range.from, range.to))
    }
    setOpen(false)
  }

  function handleClear() {
    setRange({ from: null, to: null })
  }

  const canConfirm = !!range.from
  const selectionLabel = range.from ? formatRange(range.from, range.to) : null
  const promptLabel =
    range.from && !range.to
      ? "Select check-out"
      : !range.from
        ? "Select check-in"
        : null

  return (
    <div ref={containerRef} className="relative flex-1">
      {/* ── trigger ── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full p-4 rounded-lg hover:bg-gray-100/50 transition-all duration-300 cursor-pointer text-left bg-transparent border-none"
      >
        <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 font-sans">
          Check-In / Out
        </span>
        <div className="flex items-center gap-3">
          <Calendar size={18} className="text-[#775a19] shrink-0" />
          <span className="font-serif text-lg md:text-xl font-medium text-black">
            {value}
          </span>
        </div>
      </button>

      {/* ── popover ── */}
      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 z-[200] bg-white rounded-2xl shadow-2xl border border-gray-100 p-5 w-max">
          <div className="flex items-start gap-6">
            {/* month 1 with prev nav */}
            <div className="relative">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => setView(shiftMonth(view.year, view.month, -1))}
                className="absolute left-0 top-0 h-7 w-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500 hover:text-black"
              >
                <ChevronLeft size={14} />
              </button>
              <MonthGrid
                year={view.year}
                month={view.month}
                range={range}
                hover={hover}
                today={today}
                minDate={today}
                onDay={handleDay}
                onHover={setHover}
              />
            </div>

            <div className="w-px self-stretch bg-gray-100" />

            {/* month 2 with next nav */}
            <div className="relative">
              <button
                type="button"
                aria-label="Next month"
                onClick={() => setView(shiftMonth(view.year, view.month, 1))}
                className="absolute right-0 top-0 h-7 w-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500 hover:text-black"
              >
                <ChevronRight size={14} />
              </button>
              <MonthGrid
                year={nextView.year}
                month={nextView.month}
                range={range}
                hover={hover}
                today={today}
                minDate={today}
                onDay={handleDay}
                onHover={setHover}
              />
            </div>
          </div>

          {/* ── footer ── */}
          <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between gap-4">
            <p className="text-xs font-sans">
              {selectionLabel ? (
                <span className="font-semibold text-[#775a19]">
                  {selectionLabel}
                </span>
              ) : promptLabel ? (
                <span className="text-gray-400 italic">{promptLabel}</span>
              ) : null}
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={handleClear}
                className="px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-gray-500 hover:text-black transition-colors font-sans"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!canConfirm}
                className="px-5 py-2 text-[11px] font-semibold uppercase tracking-widest bg-black text-white hover:bg-[#775a19] transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-sans"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
