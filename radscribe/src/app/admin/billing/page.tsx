"use client";

import { useEffect, useState } from "react";
import PageContainer from "@/components/layout/PageContainer";
import Header from "@/components/layout/Header";
import { useAuthStore } from "@/store/authStore";
import { useUiStore } from "@/store/uiStore";
import {
  billingApi,
  type AdminBillingUser,
  type PlanCode,
  type PlanSummary,
  type SubscriptionSummary,
  type UsageEventSummary,
} from "@/services/billing.api";

const inputClass = "h-9 rounded-lg border px-3 text-[13px] outline-none";

function PlanPriceRow({ plan, onSaved }: { plan: PlanSummary; onSaved: (plan: PlanSummary) => void }) {
  const notify = useUiStore((s) => s.notify);
  const [monthly, setMonthly] = useState(plan.monthlyPriceCents === null ? "" : String(plan.monthlyPriceCents / 100));
  const [yearly, setYearly] = useState(plan.yearlyPriceCents === null ? "" : String(plan.yearlyPriceCents / 100));
  if (plan.code !== "PRO" && plan.code !== "ULTRA") return null;
  return (
    <form className="grid items-end gap-2 sm:grid-cols-[100px_1fr_1fr_auto]" onSubmit={async (event) => {
      event.preventDefault();
      const saved = await billingApi.updatePlan(plan.code, {
        monthlyPriceCents: monthly === "" ? null : Math.round(Number(monthly) * 100),
        yearlyPriceCents: yearly === "" ? null : Math.round(Number(yearly) * 100),
      });
      onSaved(saved);
      notify(`${plan.name} pricing updated`);
    }}>
      <div className="pb-2 text-[13px] font-semibold" style={{ color: "var(--text)" }}>{plan.name}</div>
      <label className="text-[11px]" style={{ color: "var(--text-muted)" }}>Monthly ({plan.currency})<input type="number" min="0" step="0.01" value={monthly} onChange={(e) => setMonthly(e.target.value)} className={`${inputClass} mt-1 w-full`} style={{ borderColor: "var(--ring)", background: "var(--canvas)", color: "var(--text)" }} /></label>
      <label className="text-[11px]" style={{ color: "var(--text-muted)" }}>Yearly ({plan.currency})<input type="number" min="0" step="0.01" value={yearly} onChange={(e) => setYearly(e.target.value)} className={`${inputClass} mt-1 w-full`} style={{ borderColor: "var(--ring)", background: "var(--canvas)", color: "var(--text)" }} /></label>
      <button className="h-9 rounded-lg px-3 text-[12px] font-semibold text-white" style={{ background: "var(--accent)" }}>Save</button>
    </form>
  );
}

export default function AdminBillingPage() {
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === "ADMIN" || role === "PLATFORM_ADMIN";
  const isPlatformAdmin = role === "PLATFORM_ADMIN";
  const notify = useUiStore((s) => s.notify);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminBillingUser[]>([]);
  const [selected, setSelected] = useState<AdminBillingUser | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);
  const [events, setEvents] = useState<UsageEventSummary[]>([]);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [planCode, setPlanCode] = useState<PlanCode>("FREE");
  const [customLimit, setCustomLimit] = useState("");
  const [applyLater, setApplyLater] = useState(false);
  const [usedDelta, setUsedDelta] = useState("0");
  const [bonusDelta, setBonusDelta] = useState("0");
  const [reason, setReason] = useState("");

  const search = async () => setUsers(await billingApi.adminUsers(query));
  useEffect(() => {
    if (isAdmin) {
      void billingApi.adminUsers("").then(setUsers);
      void billingApi.plans().then(setPlans);
    }
  }, [isAdmin]);

  const choose = async (user: AdminBillingUser) => {
    setSelected(user);
    const [sub, usageEvents] = await Promise.all([
      billingApi.adminSubscription(user.id),
      billingApi.usageEvents(user.id),
    ]);
    setSubscription(sub);
    setEvents(usageEvents);
    setPlanCode(sub.plan.code);
    setCustomLimit(sub.plan.code === "ENTERPRISE" ? String(sub.usage.limit) : "");
  };

  if (!isAdmin) {
    return <PageContainer><Header title="Billing administration" subtitle="Administrator access is required." /></PageContainer>;
  }

  return (
    <PageContainer>
      <Header title="Billing administration" subtitle="Plans, report allowances, adjustments, and usage events." />
      {isPlatformAdmin && <section className="mx-6 mb-4 space-y-3 rounded-2xl p-5" style={{ background: "var(--panel)", boxShadow: "var(--shadow-card)" }}>
        <div><h2 className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>Paid plan pricing</h2><p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Stored as integer cents in the database. Leave a field blank to show Contact us.</p></div>
        {plans.map((plan) => <PlanPriceRow key={plan.id} plan={plan} onSaved={(saved) => setPlans((current) => current.map((item) => item.id === saved.id ? saved : item))} />)}
      </section>}
      <div className="grid min-h-0 grid-cols-1 gap-4 px-6 pb-8 lg:grid-cols-[320px_1fr]">
        <section className="rounded-2xl p-4" style={{ background: "var(--panel)", boxShadow: "var(--shadow-card)" }}>
          <form onSubmit={(e) => { e.preventDefault(); void search(); }} className="flex gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or email" className={`${inputClass} min-w-0 flex-1`} style={{ borderColor: "var(--ring)", background: "var(--canvas)", color: "var(--text)" }} />
            <button className="rounded-lg px-3 text-[12px] font-semibold text-white" style={{ background: "var(--accent)" }}>Search</button>
          </form>
          <div className="mt-3 space-y-1">
            {users.map((user) => (
              <button key={user.id} onClick={() => void choose(user)} className="w-full rounded-lg px-3 py-2 text-left" style={{ background: selected?.id === user.id ? "var(--active)" : "transparent" }}>
                <div className="truncate text-[13px] font-medium" style={{ color: "var(--text)" }}>{user.name || user.email}</div>
                <div className="truncate text-[11px]" style={{ color: "var(--text-muted)" }}>{user.email} · {user.usageSubscription?.plan.name || "No plan"}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl p-5" style={{ background: "var(--panel)", boxShadow: "var(--shadow-card)" }}>
          {!selected || !subscription ? <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Select a user to manage their subscription.</p> : (
            <div className="space-y-6">
              <div>
                <h2 className="text-[16px] font-semibold" style={{ color: "var(--text)" }}>{selected.name || selected.email}</h2>
                <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>{subscription.plan.name} · {subscription.usage.used} / {subscription.usage.limit} reports · {subscription.usage.remaining} remaining</p>
              </div>

              <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => {
                e.preventDefault();
                const updated = await billingApi.updateSubscription(selected.id, {
                  planCode,
                  billingCycle: planCode === "FREE" ? "NONE" : "MONTHLY",
                  ...(planCode === "ENTERPRISE" ? { customReportLimit: Number(customLimit) } : {}),
                  applyAtPeriodEnd: applyLater,
                });
                setSubscription(updated);
                notify(applyLater ? "Plan change scheduled" : "Plan updated");
              }}>
                <select value={planCode} onChange={(e) => setPlanCode(e.target.value as PlanCode)} className={inputClass} style={{ borderColor: "var(--ring)", background: "var(--canvas)", color: "var(--text)" }}>
                  {(["FREE", "PRO", "ULTRA", "ENTERPRISE"] as const).map((code) => <option key={code}>{code}</option>)}
                </select>
                <input type="number" min="0" disabled={planCode !== "ENTERPRISE"} value={customLimit} onChange={(e) => setCustomLimit(e.target.value)} placeholder="Enterprise report limit" className={inputClass} style={{ borderColor: "var(--ring)", background: "var(--canvas)", color: "var(--text)" }} />
                <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-muted)" }}><input type="checkbox" checked={applyLater} onChange={(e) => setApplyLater(e.target.checked)} /> Apply at period end</label>
                <button className="rounded-lg px-3 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--accent)" }}>Save subscription</button>
              </form>

              <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => {
                e.preventDefault();
                const updated = await billingApi.adjustUsage(selected.id, { reportsUsedDelta: Number(usedDelta), bonusReportsDelta: Number(bonusDelta), reason });
                setSubscription(updated);
                setUsedDelta("0"); setBonusDelta("0"); setReason("");
                notify("Usage adjustment recorded");
              }}>
                <input type="number" value={usedDelta} onChange={(e) => setUsedDelta(e.target.value)} placeholder="Usage correction" className={inputClass} style={{ borderColor: "var(--ring)", background: "var(--canvas)", color: "var(--text)" }} />
                <input type="number" value={bonusDelta} onChange={(e) => setBonusDelta(e.target.value)} placeholder="Bonus report delta" className={inputClass} style={{ borderColor: "var(--ring)", background: "var(--canvas)", color: "var(--text)" }} />
                <input required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Required adjustment reason" className={`${inputClass} sm:col-span-2`} style={{ borderColor: "var(--ring)", background: "var(--canvas)", color: "var(--text)" }} />
                <button className="rounded-lg px-3 py-2 text-[13px] font-semibold text-white sm:col-span-2" style={{ background: "var(--accent)" }}>Record adjustment</button>
              </form>

              <div>
                <h3 className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>Recent report credits</h3>
                <div className="mt-2 max-h-48 space-y-1 overflow-auto text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {events.length ? events.map((event) => <div key={event.id}>{event.reportId} · {event.consumedAt ? new Date(event.consumedAt).toLocaleString() : "Pending"}</div>) : "No consumed report credits."}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </PageContainer>
  );
}
