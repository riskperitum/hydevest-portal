"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PermissionKey } from "./constants";

type Role = string | null;

export function useRole(): { role: Role; loading: boolean } {
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      const r =
        (user?.app_metadata?.role as string | undefined) ??
        (user?.user_metadata?.role as string | undefined) ??
        null;
      setRole(r);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { role, loading };
}

/** Resolve against roles/claims when wired to Supabase or your API. */
export function usePermission(_key: PermissionKey): boolean {
  return true;
}
