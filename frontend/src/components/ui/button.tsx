"use client";

import * as React from "react";
import { motion, HTMLMotionProps } from "motion/react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  children?: React.ReactNode;
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive" | "emerald";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "md",
      isLoading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const variants = {
      default:
        "bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-none border border-emerald-500/40",
      emerald:
        "bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold shadow-none border border-emerald-400/50",
      secondary:
        "bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700/80",
      outline:
        "bg-transparent hover:bg-slate-800/80 text-slate-200 border border-slate-700",
      ghost:
        "bg-transparent hover:bg-slate-800/60 text-slate-300 hover:text-white border-transparent",
      destructive:
        "bg-rose-600 hover:bg-rose-500 text-white font-medium border border-rose-500/50",
    };

    const sizes = {
      sm: "h-8 px-3 text-xs rounded-md gap-1.5",
      md: "h-9.5 px-4 text-sm rounded-lg gap-2",
      lg: "h-11 px-6 text-base rounded-lg gap-2.5",
      icon: "h-9.5 w-9.5 p-0 rounded-lg justify-center",
    };

    return (
      <motion.button
        ref={ref}
        whileTap={{ scale: disabled || isLoading ? 1 : 0.98 }}
        disabled={disabled || isLoading}
        className={cn(
          "inline-flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:opacity-50 disabled:pointer-events-none select-none cursor-pointer",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin h-4 w-4 mr-1 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            />
          </svg>
        )}
        {children}
      </motion.button>
    );
  }
);
Button.displayName = "Button";

