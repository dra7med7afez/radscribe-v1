import { create } from "zustand";
import {
  billingApi,
  type PlanSummary,
  type SubscriptionSummary,
  type UsageSummary,
} from "@/services/billing.api";

interface SubscriptionState {
  subscription: SubscriptionSummary | null;
  plans: PlanSummary[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  loadPlans: () => Promise<void>;
  applyUsage: (usage: UsageSummary) => void;
  reset: () => void;
}

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  subscription: null,
  plans: [],
  loading: false,
  error: null,
  load: async () => {
    set({ loading: true, error: null });
    try {
      const subscription = await billingApi.subscription();
      set({ subscription, loading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Could not load subscription", loading: false });
    }
  },
  loadPlans: async () => {
    try {
      set({ plans: await billingApi.plans() });
    } catch {
      set({ plans: [] });
    }
  },
  applyUsage: (usage) =>
    set((state) => ({
      subscription: state.subscription ? { ...state.subscription, usage } : null,
    })),
  reset: () => set({ subscription: null, plans: [], loading: false, error: null }),
}));
