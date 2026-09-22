"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { clearApiCache } from "@/lib/api-cache";
import { shouldReloadProfile } from "@/hooks/profile-loader";

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
    let currentUserId: string | null = null;
    let inflight: Promise<void> | null = null;

    // Este perfil só controla o que a UI mostra. A permissão de verdade é
    // checada no servidor em cada rota (lib/server/api-auth.ts).
    function load(userId: string) {
      if (inflight && currentUserId === userId) return inflight;
      currentUserId = userId;
      inflight = (async () => {
        const { data } = await supabase
          .from("user_profiles")
          .select("id,email,full_name,role,permissions")
          .eq("id", userId)
          .single();
        if (currentUserId === userId) {
          setProfile((data as UserProfile | null) ?? null);
          setLoading(false);
        }
      })().finally(() => {
        inflight = null;
      });
      return inflight;
    }

    // Só o onAuthStateChange: ele já emite INITIAL_SESSION ao montar, então
    // uma chamada a mais aqui era carga em dobro no primeiro render. E o
    // usuário vem do próprio evento — sem getUser(), que ia ao Auth server.
    //
    // Do NOT setLoading(true) here — Supabase fires auth events (e.g. token
    // refresh) whenever the tab regains focus, and AccessGuard unmounts its
    // children while loading, which was wiping in-progress page state (like
    // the Gerador de Imagem chat) just from switching browser tabs. Refresh
    // the profile in the background instead.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUserId = session?.user.id ?? null;

      if (event === "SIGNED_OUT" || !nextUserId) {
        currentUserId = null;
        setProfile(null);
        setLoading(false);
        // Nada da sessão anterior pode aparecer para quem entrar depois.
        if (event === "SIGNED_OUT") clearApiCache();
        return;
      }

      if (shouldReloadProfile(event, nextUserId, currentUserId)) void load(nextUserId);
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
