"use client";

import { useEffect, useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { useSubscriptionStore } from "@/store/subscriptionStore";
import { useUiStore } from "@/store/uiStore";

const PLAN_ORDER = ["FREE", "PRO", "ULTRA", "ENTERPRISE"];

function formatPrice(cents: number | null, currency: string): string {
  if (cents === null) return "Contact us";
  if (cents === 0) return "Free";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default function UpgradePlansModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const plans = useSubscriptionStore((state) => state.plans);
  const subscription = useSubscriptionStore((state) => state.subscription);
  const loadPlans = useSubscriptionStore((state) => state.loadPlans);
  const loadSubscription = useSubscriptionStore((state) => state.load);
  const notify = useUiStore((state) => state.notify);
  const [yearly, setYearly] = useState(false);

  useEffect(() => {
    if (!open) return;
    void loadPlans();
    if (!subscription) void loadSubscription();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, loadPlans, loadSubscription, onClose, subscription]);

  if (!open) return null;

  const orderedPlans = [...plans].sort(
    (a, b) => PLAN_ORDER.indexOf(a.code) - PLAN_ORDER.indexOf(b.code)
  );

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-3 backdrop-blur-[2px] sm:p-6"
      onMouseDown={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="plans-title"
        className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border"
        style={{
          background: "var(--page)",
          borderColor: "var(--ring)",
          boxShadow: "0 28px 90px rgba(0,0,0,.35)",
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header
          className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b px-5 py-4 sm:px-7"
          style={{
            background: "color-mix(in srgb, var(--page) 94%, transparent)",
            borderColor: "var(--ring)",
            backdropFilter: "blur(16px)",
          }}
        >
          <div>
            <div className="flex items-center gap-2">
              <span
                className="grid h-8 w-8 place-items-center rounded-xl"
                style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
              >
                <Sparkles size={16} />
              </span>
              <h2 id="plans-title" className="text-[18px] font-semibold" style={{ color: "var(--text)" }}>
                Choose your plan
              </h2>
            </div>
            <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
              Compare monthly report allowances and request the plan that fits your workflow.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close plans"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl transition hover:bg-[var(--hover)]"
            style={{ color: "var(--text-muted)" }}
          >
            <X size={18} />
          </button>
        </header>

        <div className="px-5 py-5 sm:px-7">
          <div className="mb-5 flex justify-center">
            <div className="flex rounded-full p-1" style={{ background: "var(--panel-2)" }}>
              <button
                type="button"
                onClick={() => setYearly(false)}
                className="rounded-full px-4 py-1.5 text-[12px] font-semibold transition"
                style={
                  !yearly
                    ? { background: "var(--panel)", color: "var(--text)", boxShadow: "var(--shadow-float)" }
                    : { color: "var(--text-muted)" }
                }
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setYearly(true)}
                className="rounded-full px-4 py-1.5 text-[12px] font-semibold transition"
                style={
                  yearly
                    ? { background: "var(--panel)", color: "var(--text)", boxShadow: "var(--shadow-float)" }
                    : { color: "var(--text-muted)" }
                }
              >
                Yearly
              </button>
            </div>
          </div>

          {orderedPlans.length === 0 ? (
            <div className="py-16 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
              Loading available plans…
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {orderedPlans.map((plan) => {
                const current = subscription?.plan.code === plan.code;
                const amount = yearly ? plan.yearlyPriceCents : plan.monthlyPriceCents;
                const featured = plan.code === "PRO";
                return (
                  <article
                    key={plan.id}
                    className="relative flex min-h-[300px] flex-col overflow-hidden rounded-2xl border p-4"
                    style={{
                      background: "var(--panel)",
                      borderColor: current || featured ? "var(--accent)" : "var(--ring)",
                      boxShadow: featured ? "0 12px 32px var(--accent-soft)" : "var(--shadow-card)",
                    }}
                  >
                    {featured && !current && (
                      <span
                        className="absolute right-3 top-3 rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[.08em]"
                        style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                      >
                        Most popular
                      </span>
                    )}
                    <div className="text-[16px] font-semibold" style={{ color: "var(--text)" }}>
                      {plan.name}
                    </div>
                    <div className="mt-3 text-[26px] font-semibold tracking-tight" style={{ color: "var(--text)" }}>
                      {plan.isEnterprise ? "Custom" : formatPrice(amount, plan.currency)}
                    </div>
                    {!plan.isEnterprise && amount !== null && amount > 0 && (
                      <div className="text-[10px]" style={{ color: "var(--text-subtle)" }}>
                        per {yearly ? "year" : "month"}
                      </div>
                    )}
                    <p className="mt-3 min-h-10 text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                      {plan.description || "RadScribe reporting workspace"}
                    </p>
                    <div className="mt-4 flex items-start gap-2 text-[12px]" style={{ color: "var(--text)" }}>
                      <Check className="mt-0.5 shrink-0" size={14} style={{ color: "var(--accent)" }} />
                      <span>
                        {plan.defaultReportLimit === null
                          ? "Custom report allowance"
                          : `${plan.defaultReportLimit.toLocaleString()} reports per month`}
                      </span>
                    </div>
                    <div className="mt-2 flex items-start gap-2 text-[12px]" style={{ color: "var(--text)" }}>
                      <Check className="mt-0.5 shrink-0" size={14} style={{ color: "var(--accent)" }} />
                      <span>AI-assisted dictation and structured reports</span>
                    </div>
                    <button
                      type="button"
                      disabled={current}
                      onClick={() =>
                        notify(
                          plan.isEnterprise
                            ? "Contact your RadScribe administrator for enterprise pricing"
                            : `Ask your RadScribe administrator to switch you to ${plan.name}`
                        )
                      }
                      className="mt-auto rounded-xl px-3 py-2.5 text-[12px] font-semibold transition disabled:cursor-default"
                      style={
                        current
                          ? { background: "var(--canvas)", color: "var(--text-muted)" }
                          : { background: "var(--accent)", color: "#fff" }
                      }
                    >
                      {current ? "Current plan" : plan.isEnterprise ? "Contact us" : "Request upgrade"}
                    </button>
                  </article>
                );
              })}
            </div>
          )}

          <p className="mt-5 text-center text-[11px]" style={{ color: "var(--text-subtle)" }}>
            Plan changes are approved by your organization administrator. Online checkout is not currently enabled.
          </p>
        </div>
      </section>
    </div>
  );
}
