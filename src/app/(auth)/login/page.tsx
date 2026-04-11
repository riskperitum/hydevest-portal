import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Sign in</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Use Supabase Auth (email, SSO, etc.) from here once wired.
        </p>
      </div>
      <p className="text-sm text-zinc-500">
        <Link href="/forgot-password" className="font-medium text-zinc-900 underline dark:text-zinc-300">
          Forgot password?
        </Link>
      </p>
    </div>
  );
}
