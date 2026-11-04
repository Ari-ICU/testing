"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

export interface SliderProps
  extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  label?: string;
  valueDisplay?: React.ReactNode;
}

export const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(({ className, label, valueDisplay, ...props }, ref) => (
  <div className="w-full space-y-2">
    {(label || valueDisplay) && (
      <div className="flex items-center justify-between text-xs font-medium">
        {label && <span className="text-slate-300">{label}</span>}
        {valueDisplay && (
          <span className="text-emerald-400 font-mono font-semibold">
            {valueDisplay}
          </span>
        )}
      </div>
    )}
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        "relative flex w-full touch-none select-none items-center py-1 cursor-pointer",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-slate-800">
        <SliderPrimitive.Range className="absolute h-full bg-emerald-500" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border border-emerald-400 bg-white shadow-md transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 hover:scale-110 active:scale-95" />
    </SliderPrimitive.Root>
  </div>
));
Slider.displayName = SliderPrimitive.Root.displayName;

