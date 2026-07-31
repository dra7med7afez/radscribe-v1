import { apiFetch } from "@/lib/api/client";

export type PlanCode = "FREE" | "PRO" | "ULTRA" | "ENTERPRISE";

export interface PlanSummary {
  id: string;
  code: PlanCode;
  name: string;
  description?: string | null;
  monthlyPriceCents: number | null;
  yearlyPriceCents: number | null;
  currency: string;
  defaultReportLimit: number | null;
  usageInterval: "MONTHLY" | "LIFETIME";
  isEnterprise: boolean;
  features?: unknown;
}

export interface UsageSummary {
  periodStart: string;
  periodEnd: string | null;
  used: number;
  bonus: number;
  limit: number;
  remaining: number;
}

export interface SubscriptionSummary {
  subscriptionId: string;
  status: "ACTIVE" | "PAST_DUE" | "CANCELED";
  billingCycle: "NONE" | "MONTHLY" | "YEARLY";
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string;
  currentPeriodEnd: string | null;
  pendingChangeAt: string | null;
  pendingPlan: PlanCode | null;
  plan: { id: string; code: PlanCode; name: string; isEnterprise: boolean };
  usage: UsageSummary;
}

export interface AdminBillingUser {
  id: string;
  email: string;
  name: string | null;
  active: boolean;
  organizationId: string;
  usageSubscription: { status: string; plan: { code: PlanCode; name: string } } | null;
}

export interface UsageEventSummary {
  id: string;
  reportId: string;
  usagePeriodId: string;
  eventType: string;
  consumedAt: string | null;
}

export const billingApi = {
  plans: () => apiFetch<PlanSummary[]>("/plans", { auth: false }),
  subscription: () => apiFetch<SubscriptionSummary>("/subscription/me"),
  usage: () => apiFetch<UsageSummary>("/usage/me"),
  adminUsers: (query = "") =>
    apiFetch<AdminBillingUser[]>(`/admin/billing/users?query=${encodeURIComponent(query)}`),
  adminSubscription: (userId: string) =>
    apiFetch<SubscriptionSummary>(`/admin/users/${userId}/subscription`),
  updateSubscription: (
    userId: string,
    input: { planCode: PlanCode; billingCycle?: "NONE" | "MONTHLY" | "YEARLY"; customReportLimit?: number; applyAtPeriodEnd?: boolean }
  ) => apiFetch<SubscriptionSummary>(`/admin/users/${userId}/subscription`, { method: "PATCH", body: input }),
  adjustUsage: (
    userId: string,
    input: { reportsUsedDelta: number; bonusReportsDelta: number; reason: string }
  ) => apiFetch<SubscriptionSummary>(`/admin/users/${userId}/usage-adjustments`, { method: "POST", body: input }),
  usageEvents: (userId: string) =>
    apiFetch<UsageEventSummary[]>(`/admin/users/${userId}/usage-events`),
  updatePlan: (
    code: PlanCode,
    input: { monthlyPriceCents?: number | null; yearlyPriceCents?: number | null; isActive?: boolean }
  ) => apiFetch<PlanSummary>(`/admin/plans/${code}`, { method: "PATCH", body: input }),
};
