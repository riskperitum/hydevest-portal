"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/overview", label: "Overview" },
  { href: "/purchase/trips", label: "Purchase · Trips" },
  { href: "/purchase/containers", label: "Purchase · Containers" },
  { href: "/sales", label: "Sales" },
  { href: "/inventory", label: "Inventory" },
  { href: "/expensify", label: "Expensify" },
  { href: "/finance", label: "Finance" },
  { href: "/partnership", label: "Partnership" },
  { href: "/reports", label: "Reports" },
  { href: "/requestbox", label: "Request box" },
  { href: "/admin", label: "Admin" },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
        <Link href="/overview" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Hydevest
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-md px-3 py-2 text-sm transition-colors",
              pathname === item.href || pathname.startsWith(item.href + "/")
                ? "bg-zinc-200 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
