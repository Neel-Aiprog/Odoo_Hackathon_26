import { cn } from "@/lib/cn";
import { InputHTMLAttributes, forwardRef } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "h-11 w-full rounded-2xl border border-white/10 bg-[#121312] px-4 text-sm text-text-primary outline-none",
          "placeholder:text-text-placeholder",
          "focus-visible:border-mathical-purple/70 focus-visible:ring-1 focus-visible:ring-mathical-purple/50",
          "disabled:cursor-not-allowed disabled:opacity-60",
          "[color-scheme:dark]",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
