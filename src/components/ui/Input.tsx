import React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  className = "",
  id,
  ...props
}) => {
  const generatedId = React.useId();
  const inputId = id || generatedId;
  const descriptionId = error || helperText ? `${inputId}-description` : undefined;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-700 mb-2">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`w-full min-h-12 px-4 py-3 bg-white border rounded-xl text-base sm:text-sm text-ink placeholder-slate-500 focus:outline-hidden focus:ring-2 transition-colors ${
          error
            ? "border-red-500 focus:border-red-500 focus:ring-red-100"
            : "border-line focus:border-accent-600 focus:ring-accent-600/15"
        } ${className}`}
        {...props}
        aria-invalid={error ? true : props["aria-invalid"]}
        aria-describedby={
          [props["aria-describedby"], descriptionId].filter(Boolean).join(" ") || undefined
        }
      />
      {error && (
        <p id={descriptionId} role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
      {helperText && !error && (
        <p id={descriptionId} className="mt-1 text-xs text-slate-600">
          {helperText}
        </p>
      )}
    </div>
  );
};

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: Array<{ value: string; label: string }>;
}

export const Select: React.FC<SelectProps> = ({
  label,
  error,
  options,
  className = "",
  id,
  ...props
}) => {
  const generatedId = React.useId();
  const selectId = id || generatedId;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-slate-700 mb-2">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`w-full min-h-12 px-4 py-3 bg-white border rounded-xl text-base sm:text-sm text-ink focus:outline-hidden focus:ring-2 transition-colors ${
          error
            ? "border-red-500 focus:border-red-500 focus:ring-red-100"
            : "border-line focus:border-accent-600 focus:ring-accent-600/15"
        } ${className}`}
        {...props}
        aria-invalid={error ? true : props["aria-invalid"]}
        aria-describedby={
          [props["aria-describedby"], error ? `${selectId}-error` : undefined]
            .filter(Boolean)
            .join(" ") || undefined
        }
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={`${selectId}-error`} role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
};
