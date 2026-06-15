"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type UserRole = "superadmin" | "owner" | "manager" | "vendor" | "employee" | "client";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  permissions: Record<string, boolean>;
}

export function useCurrentUser() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      setProfile(data ?? null);
      setLoading(false);
    }

    load();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      setLoading(true);
      load();
    });

    return () => subscription.unsubscribe();
  }, []);

  return {
    profile,
    loading,
    isSuperAdmin: profile?.role === "superadmin",
    isOwnerOrAbove: profile ? ["superadmin", "owner"].includes(profile.role) : false,
    isManagerOrAbove: profile ? ["superadmin", "owner", "manager"].includes(profile.role) : false,
    can: (permission: string) => profile?.permissions?.[permission] === true,
  };
}
