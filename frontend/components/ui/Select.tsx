import { cn } from "@/lib/cn";
import { SelectHTMLAttributes, forwardRef } from "react";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          "h-11 w-full appearance-none rounded-2xl border border-white/10 bg-[#121312] px-4 pr-9 text-sm text-text-primary outline-none",
          "focus-visible:border-mathical-purple/70 focus-visible:ring-1 focus-visible:ring-mathical-purple/50",
          "disabled:cursor-not-allowed disabled:opacity-60",
          "[color-scheme:dark]",
          className,
        )}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23808388' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 0.85rem center",
          backgroundSize: "1rem",
        }}
        {...props}
      >
        {children}
      </select>
    );
  },
);
Select.displayName = "Select";
