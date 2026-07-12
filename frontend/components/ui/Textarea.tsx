import { cn } from "@/lib/cn";
import { TextareaHTMLAttributes, forwardRef } from "react";

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "min-h-[5rem] w-full resize-none rounded-2xl border border-white/10 bg-[#121312] px-4 py-3 text-sm text-text-primary outline-none",
          "placeholder:text-text-placeholder",
          "focus-visible:border-mathical-purple/70 focus-visible:ring-1 focus-visible:ring-mathical-purple/50",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";
