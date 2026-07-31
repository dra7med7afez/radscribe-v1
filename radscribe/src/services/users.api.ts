import { apiFetch } from "@/lib/api/client";

// Admin user management + per-user settings sync.

export interface ManagedUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface CreateUserInput {
  email: string;
  name: string;
  role: "ADMIN" | "RADIOLOGIST";
  password: string; // temporary — user must change it on first login
}

export interface UpdateUserInput {
  name?: string;
  role?: "ADMIN" | "RADIOLOGIST";
  active?: boolean;
  password?: string; // admin reset — forces change on next login
}

export const usersApi = {
  list: () => apiFetch<ManagedUser[]>("/users"),
  create: (input: CreateUserInput) =>
    apiFetch<ManagedUser>("/users", { method: "POST", body: input }),
  update: (id: string, input: UpdateUserInput) =>
    apiFetch<ManagedUser>(`/users/${id}`, { method: "PATCH", body: input }),
  remove: (id: string) =>
    apiFetch<{ ok: boolean }>(`/users/${id}`, { method: "DELETE" }),

  getSettings: () =>
    apiFetch<{ settings: Record<string, unknown> | null }>("/users/me/settings"),
  saveSettings: (settings: Record<string, unknown>) =>
    apiFetch<{ ok: boolean }>("/users/me/settings", {
      method: "PATCH",
      body: { settings },
    }),
};
