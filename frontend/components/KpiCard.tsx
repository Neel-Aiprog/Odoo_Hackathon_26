import { cn } from "@/lib/cn";
import { LucideIcon } from "lucide-react";

export function KpiCard({
  label,
  value,
  description,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  description?: string;
  icon?: LucideIcon;
  accent?: "warning" | "success" | "primary";
}) {
  return (
    <div className="flex flex-col justify-between px-6 py-2 border-r border-black/10 last:border-0 hover:scale-[1.02] transition duration-200">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-black/60">
          {label}
        </p>
      </div>
      <div className="mt-2">
        <p className="text-3xl font-extrabold tracking-tighter text-[#050605]">
          {value}
        </p>
        {description ? (
          <p className="mt-0.5 text-[10px] leading-tight text-black/70 font-semibold">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
