"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type UserRole = "superadmin" | "owner" | "manager" | "vendor" | "employee" | "client";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  permissions: Record<string, boolean>;
}

const CurrentUserContext = createContext<{ profile: UserProfile | null; loading: boolean }>({
  profile: null,
  loading: true,
});

export function CurrentUserProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setProfile(null); setLoading(false); return; }

      const { data } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      setProfile(data ?? null);
      setLoading(false);
    }

    load();

    // Do NOT setLoading(true) here — Supabase fires auth events (e.g. token
    // refresh) whenever the tab regains focus, and AccessGuard unmounts its
    // children while loading, which was wiping in-progress page state (like
    // the Gerador de Imagem chat) just from switching browser tabs. Refresh
    // the profile in the background instead.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setProfile(null);
        setLoading(false);
        return;
      }
      load();
    });

    return () => subscription.unsubscribe();
  }, []);

  return <CurrentUserContext.Provider value={{ profile, loading }}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser() {
  const { profile, loading } = useContext(CurrentUserContext);

  return {
    profile,
    loading,
    isSuperAdmin: profile?.role === "superadmin",
    isOwnerOrAbove: profile ? ["superadmin", "owner"].includes(profile.role) : false,
    isManagerOrAbove: profile ? ["superadmin", "owner", "manager"].includes(profile.role) : false,
    can: (permission: string) => profile?.permissions?.[permission] === true,
  };
}
