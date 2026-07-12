import Link from "next/link";

export function Sidebar({ currentItem }: { currentItem: string }) {
  const items = [
    { name: "Dashboard", href: "#" },
    { name: "Organization setup", href: "/organization" },
    { name: "Assets", href: "/" },
    { name: "Allocation & Transfer", href: "/allocations" },
    { name: "Resource Booking", href: "#" },
    { name: "Maintenance", href: "#" },
    { name: "Audit", href: "#" },
    { name: "Reports", href: "#" },
    { name: "Notifications", href: "#" },
  ];

  return (
    <aside className="hidden w-[250px] shrink-0 border-r border-stone-200/10 bg-[#111411] px-5 py-6 lg:flex lg:flex-col">
      <div>
        <p className="text-3xl font-semibold tracking-tight text-stone-50">AssetFlow</p>
        <p className="mt-2 text-sm text-stone-400">Central registry for inventory, lifecycle, and tracking.</p>
      </div>
      <nav className="mt-10 space-y-2 text-[15px] text-stone-300">
        {items.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className={`block rounded-xl px-4 py-2.5 ${item.name === currentItem ? "border border-emerald-400/45 bg-emerald-400/10 text-stone-50" : "text-stone-300/90 transition hover:bg-stone-100/5"}`}
          >
            {item.name}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
