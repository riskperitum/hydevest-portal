import Link from "next/link";

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Reset password</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Trigger a Supabase password reset email from this flow when implemented.
        </p>
      </div>
      <p className="text-sm">
        <Link href="/login" className="font-medium text-zinc-900 underline dark:text-zinc-300">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
