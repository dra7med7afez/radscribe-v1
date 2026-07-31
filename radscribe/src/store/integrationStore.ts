import { create } from "zustand";
import { apiFetch } from "@/lib/api/client";
import type { Integration, IntegrationType } from "@/types";

interface IntegrationState {
  integrations: Integration[];
  loaded: boolean;
  load: () => Promise<void>;
  upsert: (integration: Integration) => Promise<void>;
  remove: (id: string) => Promise<void>;
  test: (id: string) => Promise<boolean>;
  byType: (type: IntegrationType) => Integration | undefined;
  reset: () => void;
}

// Integration metadata and credential masks are server-managed. Do not retain
// endpoint configuration in browser storage or invent offline success states.
export const useIntegrationStore = create<IntegrationState>((set, get) => ({
  integrations: [],
  loaded: false,

  load: async () => {
    const integrations = await apiFetch<Integration[]>("/integrations");
    set({ integrations, loaded: true });
  },

  upsert: async (integration) => {
    const saved = integration.id
      ? await apiFetch<Integration>(`/integrations/${integration.id}`, {
          method: "PATCH",
          body: {
            name: integration.name,
            config: integration.config,
            enabled: integration.enabled,
          },
        })
      : await apiFetch<Integration>("/integrations", {
          method: "POST",
          body: {
            type: integration.type,
            name: integration.name,
            config: integration.config,
            enabled: integration.enabled,
          },
        });
    set((state) => ({
      integrations: state.integrations.some((entry) => entry.id === saved.id)
        ? state.integrations.map((entry) => (entry.id === saved.id ? saved : entry))
        : [...state.integrations, saved],
    }));
  },

  remove: async (id) => {
    await apiFetch(`/integrations/${id}`, { method: "DELETE" });
    set((state) => ({ integrations: state.integrations.filter((entry) => entry.id !== id) }));
  },

  test: async (id) => {
    const response = await apiFetch<{ ok: boolean }>(`/integrations/${id}/test`, {
      method: "POST",
    });
    return response.ok;
  },

  byType: (type) => get().integrations.find((entry) => entry.type === type),
  reset: () => set({ integrations: [], loaded: false }),
}));
