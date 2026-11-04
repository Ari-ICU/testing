import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "outline" | "emerald" | "cyan" | "amber" | "rose";
}

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  const variants = {
    default: "bg-slate-800 text-slate-200 border-slate-700",
    secondary: "bg-slate-800/80 text-slate-300 border-slate-700/60",
    outline: "bg-transparent text-slate-300 border-slate-700",
    emerald: "bg-emerald-950/60 text-emerald-400 border-emerald-800/60",
    cyan: "bg-cyan-950/60 text-cyan-400 border-cyan-800/60",
    amber: "bg-amber-950/60 text-amber-400 border-amber-800/60",
    rose: "bg-rose-950/60 text-rose-400 border-rose-800/60",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

