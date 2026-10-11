import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = "", ...props }) => {
  return (
    <div
      className={`bg-white border border-slate-200/80 rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const StatCard: React.FC<{
  title: string;
  value: string | number;
  change?: string;
  icon?: React.ReactNode;
}> = ({ title, value, change, icon }) => {
  return (
    <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-start justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">{title}</p>
        <p className="text-2xl font-bold text-[#0B1220]">{value}</p>
        {change && <p className="text-xs font-medium text-emerald-600 mt-1">{change}</p>}
      </div>
      {icon && <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg text-slate-600">{icon}</div>}
    </div>
  );
};
