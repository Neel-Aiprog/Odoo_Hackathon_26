import { cn } from "@/lib/cn";
import { HTMLAttributes } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {}

export function Card({
  children,
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[2rem] border border-white/5 bg-[#090a09] p-6 shadow-xl",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
