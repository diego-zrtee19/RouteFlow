import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "destructive" | "outline" | "ghost" | "success";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

/** Shared treatment for actions rendered as real links instead of nested buttons. */
export function buttonStyles({
  variant = "primary",
  size = "md",
  className = "",
}: Pick<ButtonProps, "variant" | "size" | "className"> = {}) {
  const base =
    "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border font-semibold leading-snug text-center select-none cursor-pointer transition-[background-color,border-color,box-shadow,color,transform] duration-200 motion-reduce:transition-none motion-safe:active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent-700 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none disabled:transform-none [&_svg]:shrink-0";
  const sizes = {
    sm: "px-3.5 py-2 text-sm",
    md: "px-4 py-2.5 text-sm",
    lg: "min-h-12 px-6 py-3 text-base",
  };
  const variants = {
    primary:
      "border-accent-700 bg-accent-700 text-white shadow-[0_1px_2px_rgba(15,23,42,0.12)] hover:border-accent-600 hover:bg-accent-600 hover:shadow-[0_5px_14px_rgba(18,58,102,0.18)] active:bg-accent-900",
    secondary:
      "border-line bg-white text-ink shadow-[0_1px_2px_rgba(18,58,102,0.04)] hover:bg-surface hover:border-accent-300 active:bg-accent-50",
    outline:
      "border-line bg-transparent text-accent-700 hover:border-accent-700 hover:bg-accent-50 active:bg-accent-100",
    ghost:
      "border-transparent bg-transparent text-muted hover:bg-accent-50 hover:text-accent-700 active:bg-accent-100",
    destructive:
      "border-rose-700 bg-rose-700 text-white hover:border-rose-800 hover:bg-rose-800 active:bg-rose-900",
    success:
      "border-emerald-700 bg-emerald-700 text-white hover:border-emerald-800 hover:bg-emerald-800 active:bg-emerald-900",
  };
  return `${base} ${sizes[size]} ${variants[variant]} ${className}`;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  size = "md",
  isLoading = false,
  disabled,
  className = "",
  ...props
}) => {
  return (
    <button
      disabled={disabled || isLoading}
      className={buttonStyles({ variant, size, className })}
      {...props}
      aria-busy={isLoading || props["aria-busy"]}
    >
      {isLoading ? (
        <svg
          className="animate-spin h-4 w-4 text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      ) : null}
      {children}
    </button>
  );
};
