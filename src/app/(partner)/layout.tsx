export default function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Partner</span>
      </header>
      <div className="flex-1 p-6">{children}</div>
    </div>
  );
}
