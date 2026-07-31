"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSubscriptionStore } from "@/store/subscriptionStore";

export default function UsageCard({ compact = false }: { compact?: boolean }) {
  const subscription = useSubscriptionStore((s) => s.subscription);
  const loading = useSubscriptionStore((s) => s.loading);
  const load = useSubscriptionStore((s) => s.load);

  useEffect(() => {
    if (!subscription && !loading) void load();
  }, [subscription, loading, load]);

  if (!subscription) {
    return <div className="text-[12px]" style={{ color: "var(--text-subtle)" }}>{loading ? "Loading usage…" : "Usage unavailable"}</div>;
  }

  const { usage, plan } = subscription;
  const percentage = usage.limit ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;
  const warning = percentage >= 100 ? "var(--abnormal)" : percentage >= 90 ? "#b76b00" : "var(--accent)";
  const reset = usage.periodEnd
    ? new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric" }).format(new Date(usage.periodEnd))
    : "Never";

  return (
    <div className={compact ? "rounded-xl p-3" : "rounded-xl border p-4"} style={{ background: "var(--canvas)", borderColor: "var(--ring)" }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>{plan.name}</div>
          <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            {usage.used.toLocaleString()} / {usage.limit.toLocaleString()} reports
          </div>
        </div>
        {(plan.code === "FREE" || percentage >= 90) && (
          <Link href="/pricing" className="text-[12px] font-semibold" style={{ color: warning }}>
            {percentage >= 100 ? "Upgrade" : "Plans"}
          </Link>
        )}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--ring)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${percentage}%`, background: warning }} />
      </div>
      {!compact && (
        <div className="mt-2 flex justify-between text-[11px]" style={{ color: percentage >= 80 ? warning : "var(--text-subtle)" }}>
          <span>{usage.remaining.toLocaleString()} reports remaining</span>
          <span>{usage.periodEnd ? `Resets ${reset}` : "Lifetime allowance"}</span>
        </div>
      )}
    </div>
  );
}

