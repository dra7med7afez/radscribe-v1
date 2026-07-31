"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import PageContainer from "@/components/layout/PageContainer";
import Header from "@/components/layout/Header";
import { useSubscriptionStore } from "@/store/subscriptionStore";
import { useUiStore } from "@/store/uiStore";

function price(cents: number | null, currency: string) {
  if (cents === null) return "Contact us";
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

export default function PricingPage() {
  const plans = useSubscriptionStore((s) => s.plans);
  const subscription = useSubscriptionStore((s) => s.subscription);
  const loadPlans = useSubscriptionStore((s) => s.loadPlans);
  const load = useSubscriptionStore((s) => s.load);
  const notify = useUiStore((s) => s.notify);
  const [yearly, setYearly] = useState(false);

  useEffect(() => {
    void loadPlans();
    if (!subscription) void load();
  }, [loadPlans, load, subscription]);

  const ordered = [...plans].sort(
    (a, b) => ["FREE", "PRO", "ULTRA", "ENTERPRISE"].indexOf(a.code) - ["FREE", "PRO", "ULTRA", "ENTERPRISE"].indexOf(b.code)
  );

  return (
    <PageContainer>
      <Header title="Plans & pricing" subtitle="Plan changes are assigned by your organization administrator; online checkout is not enabled." />
      <div className="mb-5 flex justify-center px-6">
        <div className="flex rounded-full p-1" style={{ background: "var(--panel-2)" }}>
          {[false, true].map((value) => (
            <button key={String(value)} onClick={() => setYearly(value)} className="rounded-full px-4 py-1.5 text-[12px] font-medium" style={yearly === value ? { background: "var(--panel)", color: "var(--text)", boxShadow: "var(--shadow-float)" } : { color: "var(--text-muted)" }}>
              {value ? "Yearly" : "Monthly"}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 px-6 pb-8 md:grid-cols-2 xl:grid-cols-4">
        {ordered.map((plan) => {
          const current = subscription?.plan.code === plan.code;
          const amount = yearly ? plan.yearlyPriceCents : plan.monthlyPriceCents;
          return (
            <section key={plan.id} className="flex min-h-[330px] flex-col rounded-2xl border p-5" style={{ background: "var(--panel)", borderColor: current ? "var(--accent)" : "var(--ring)", boxShadow: "var(--shadow-card)" }}>
              <div className="text-[18px] font-semibold" style={{ color: "var(--text)" }}>{plan.name}</div>
              <div className="mt-3 text-[28px] font-semibold" style={{ color: "var(--text)" }}>
                {plan.isEnterprise ? "Custom" : price(amount, plan.currency)}
              </div>
              {!plan.isEnterprise && amount !== null && amount > 0 && <div className="text-[11px]" style={{ color: "var(--text-subtle)" }}>per {yearly ? "year" : "month"}</div>}
              <div className="mt-5 flex items-center gap-2 text-[13px]" style={{ color: "var(--text)" }}>
                <Check size={15} style={{ color: "var(--accent)" }} />
                {plan.defaultReportLimit === null ? "Custom report allowance" : `${plan.defaultReportLimit.toLocaleString()} reports per month`}
              </div>
              {plan.description && <p className="mt-3 text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{plan.description}</p>}
              <button
                type="button"
                disabled={current}
                onClick={() => notify("Contact your RadScribe administrator to request a plan change")}
                className="mt-auto rounded-lg px-3 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
                style={{ background: "var(--accent)" }}
              >
                {current ? "Current Plan" : "Contact administrator"}
              </button>
            </section>
          );
        })}
      </div>
    </PageContainer>
  );
}
