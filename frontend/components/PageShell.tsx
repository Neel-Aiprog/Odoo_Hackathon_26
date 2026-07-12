import { Sidebar } from "@/app/Sidebar";
import { cn } from "@/lib/cn";

export interface PageShellProps {
  currentItem: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function PageShell({
  currentItem,
  title,
  subtitle,
  actions,
  children,
  className,
}: PageShellProps) {
  return (
    <div className="flex min-h-screen bg-black text-text-primary select-none font-sans">
      <Sidebar currentItem={currentItem} />
      <main className={cn("flex min-w-0 flex-1 flex-col p-4 bg-black h-screen overflow-hidden", className)}>
        <div className="flex flex-col h-full bg-[#080908] rounded-[2.2rem] border border-white/5 overflow-hidden">
          <header className="border-b border-white/5 bg-transparent px-8 py-6 shrink-0">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="font-heading text-2xl font-bold tracking-tight text-white">
                  {title}
                </h1>
                {subtitle ? (
                  <p className="mt-1 text-xs font-medium leading-relaxed text-text-muted">
                    {subtitle}
                  </p>
                ) : null}
              </div>
              {actions ? (
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  {actions}
                </div>
              ) : null}
            </div>
          </header>
          <div className="flex-1 overflow-y-auto p-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
