import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" &&
          "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200",
        variant === "ghost" && "hover:bg-zinc-100 dark:hover:bg-zinc-800",
        className,
      )}
      {...props}
    />
  );
}
