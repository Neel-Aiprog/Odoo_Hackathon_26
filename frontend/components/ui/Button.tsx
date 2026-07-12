import { cn } from "@/lib/cn";
import { ButtonHTMLAttributes, forwardRef } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading, children, disabled, ...props }, ref) => {
    const base =
      "inline-flex items-center justify-center rounded-full font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mathical-purple focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-50 disabled:cursor-not-allowed select-none";

    const variants = {
      primary:
        "bg-mathical-purple text-white hover:opacity-90 shadow-[0_4px_14px_rgba(76,81,230,0.3)]",
      secondary:
        "border border-white/10 bg-[#121312] text-stone-200 hover:bg-stone-900",
      danger:
        "bg-mathical-pink text-black hover:opacity-90",
      ghost:
        "text-text-muted hover:text-white hover:bg-stone-900",
    };

    const sizes = {
      sm: "h-8 px-4 text-xs",
      md: "h-10 px-5 text-sm",
      lg: "h-11 px-6 text-sm",
    };

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : null}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
