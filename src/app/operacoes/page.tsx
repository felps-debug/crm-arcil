"use client";

import { useEffect, useState } from "react";
import { OperationalWall } from "@/components/operational-wall";
import { useApi } from "@/lib/client-api";
import { createClient } from "@/lib/supabase/client";
import type { DashboardSummaryResponse, AgentSummaryResponse, PendingCenterResponse, InventorySummaryResponse } from "@/types/api";

export default function OperacoesPage() {
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => setRefreshTick((t) => t + 1);

    const channels = [
      supabase.channel("summary-rt")
        .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, refresh)
        .subscribe(),
      supabase.channel("followup-rt")
        .on("postgres_changes", { event: "*", schema: "public", table: "followups" }, refresh)
        .subscribe(),
      supabase.channel("cobranca-rt")
        .on("postgres_changes", { event: "*", schema: "public", table: "cobranca_log" }, refresh)
        .subscribe(),
      supabase.channel("conv-rt")
        .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, refresh)
        .subscribe(),
    ];

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, []);

  const summary = useApi<DashboardSummaryResponse>(`/api/dashboard/summary?_r=${refreshTick}`);
  const agents = useApi<AgentSummaryResponse>(`/api/agents/summary?_r=${refreshTick}`);
  const pending = useApi<PendingCenterResponse>(`/api/dashboard/pending-center?_r=${refreshTick}`);
  const inventory = useApi<InventorySummaryResponse>(`/api/inventory/summary?_r=${refreshTick}`);

  const [realtimeState, setRealtimeState] = useState<"connected" | "connecting" | "disconnected">("connected");

  return (
    <OperationalWall
      summary={summary.data}
      agents={agents.data}
      pending={pending.data}
      inventory={inventory.data}
      realtimeState={realtimeState}
    />
  );
}
