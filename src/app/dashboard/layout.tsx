import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";

export default function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
        <Link href="/dashboard" className="flex items-center shrink-0">
          <BrandLogo className="h-10 w-auto max-w-[12rem] object-contain object-left" />
        </Link>
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Partner
        </span>
      </header>
      <div className="flex-1 p-6">{children}</div>
    </div>
  );
}
