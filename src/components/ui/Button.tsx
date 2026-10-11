import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "destructive" | "outline" | "ghost" | "success";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
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
  const baseStyles = "inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 select-none cursor-pointer";

  const sizeStyles = {
    sm: "text-xs px-3 py-1.5 gap-1.5",
    md: "text-sm px-4 py-2 gap-2",
    lg: "text-base px-6 py-3 gap-2.5",
  };

  const variantStyles = {
    primary: "bg-[#2563EB] hover:bg-[#1D4ED8] text-white focus:ring-[#2563EB]/40 shadow-sm shadow-blue-500/20",
    secondary: "bg-white hover:bg-slate-50 text-[#0B1220] border border-slate-200 focus:ring-slate-300 shadow-sm",
    destructive: "bg-[#DC2626] hover:bg-red-700 text-white focus:ring-red-400 shadow-sm shadow-red-500/20",
    outline: "bg-transparent hover:bg-slate-100 text-[#0B1220] border border-slate-300 focus:ring-slate-300",
    ghost: "bg-transparent hover:bg-slate-100 text-[#475569] hover:text-[#0B1220] focus:ring-slate-200",
    success: "bg-[#16A34A] hover:bg-emerald-700 text-white focus:ring-emerald-400 shadow-sm",
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <svg
          className="animate-spin h-4 w-4 text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8H4z"
          />
        </svg>
      ) : null}
      {children}
    </button>
  );
};
