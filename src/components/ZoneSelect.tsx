"use client";

import { ZONES } from "@/lib/types";

interface ZoneSelectProps {
  id?: string;
  label: string;
  value: string;
  onChange: (zone: string) => void;
  error?: string;
  hint?: string;
}

export function ZoneSelect({
  id,
  label,
  value,
  onChange,
  error,
  hint,
}: ZoneSelectProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-gray-700 mb-1.5">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-4 py-3 rounded-xl border-2 transition-all bg-white text-gray-900 focus:outline-none ${
          error
            ? "border-red-300 focus:border-red-500"
            : "border-gray-200 focus:border-primary-500"
        }`}
      >
        {ZONES.map((z) => (
          <option key={z} value={z}>
            {z}
          </option>
        ))}
      </select>
      {hint && !error && (
        <p className="text-[11px] text-gray-500 mt-1.5">{hint}</p>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
