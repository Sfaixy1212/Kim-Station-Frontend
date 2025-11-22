import React from 'react';

export default function Stepper({ steps, current }) {
  const total = steps.length;
  const clamped = Math.min(Math.max(current, 0), total - 1);
  const percent = (clamped / (total - 1)) * 100;

  return (
    <div className="relative h-16">
      {/* progress line (centered vertically) */}
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-gray-200 rounded-full" aria-hidden />
      <div
        className="absolute left-0 top-1/2 -translate-y-1/2 h-[2px] bg-blue-500 rounded-full transition-all duration-500 ease-out"
        style={{ width: `${percent}%` }}
        aria-hidden
      />
      {/* steps */}
      <ol className="relative z-[1] grid grid-cols-4">
        {steps.map((s, i) => {
          const isDone = i < clamped;
          const isCurrent = i === clamped;
          return (
            <li key={s.key} className="relative flex flex-col items-center">
              {/* Dot absolutely centered on the progress line */}
              <span
                className={`absolute top-1/2 -translate-y-1/2 -translate-y-[18px] flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all duration-300 ${
                  isDone
                    ? 'bg-blue-600 text-white shadow-sm'
                    : isCurrent
                    ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-200'
                    : 'bg-gray-100 text-gray-500'
                }`}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {i + 1}
              </span>
              {/* Label placed below the dot */}
              <span className={`mt-12 text-xs font-medium ${isCurrent ? 'text-gray-900' : 'text-gray-500'}`}>{s.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
