import { cn } from "@/lib/cn";

export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: "default" | "primary" | "warning" | "success" | "muted";
  className?: string;
}) {
  const variants = {
    default:
      "border-white/5 bg-stone-900 text-stone-200",
    primary:
      "border-mathical-purple/35 bg-mathical-purple/10 text-[#6e73ff] font-semibold",
    warning:
      "border-mathical-pink/35 bg-mathical-pink/10 text-mathical-pink font-semibold",
    success:
      "border-mathical-lime/35 bg-mathical-lime/10 text-mathical-lime font-semibold",
    muted:
      "border-white/5 bg-stone-950 text-stone-500",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold select-none",
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
