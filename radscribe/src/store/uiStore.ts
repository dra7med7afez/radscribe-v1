import { create } from "zustand";

type Theme = "light" | "dark";
export type MicrophoneOwner = "report" | "selected-text";

interface UiState {
  mounted: boolean;
  theme: Theme;
  sidebarExpanded: boolean;
  settingsOpen: boolean;
  // Push-to-talk: KeyboardEvent.key values that HOLD to dictate. Both the
  // keyboard (Ctrl) and an external physical button that emulates a keyboard
  // key land here — they are indistinguishable to the browser and drive the
  // same mic state. Device-local (localStorage), not synced, since the pedal
  // is tied to this laptop.
  pttBindings: string[];
  // A single physical microphone may serve two entry points. Ownership keeps
  // selected-range dictation from racing caret/report dictation.
  microphoneOwner: MicrophoneOwner | null;
  toast: string | null;
  _toastTimer: ReturnType<typeof setTimeout> | null;

  hydrate: () => void;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  toggleSidebar: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  addPttBinding: (key: string) => void;
  removePttBinding: (key: string) => void;
  acquireMicrophone: (owner: MicrophoneOwner) => boolean;
  releaseMicrophone: (owner: MicrophoneOwner) => void;
  notify: (msg: string) => void;
}

const THEME_KEY = "radscribe-theme";
const LEGACY_WORKFLOW_KEY = "radscribe-workflow";
const PTT_KEY = "radscribe-ptt-bindings";
const DEFAULT_PTT: string[] = ["Control"];

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export const useUiStore = create<UiState>((set, get) => ({
  mounted: false,
  theme: "light",
  sidebarExpanded: false, // collapsed/compact by default (§4, §5)
  settingsOpen: false,
  pttBindings: DEFAULT_PTT,
  microphoneOwner: null,
  toast: null,
  _toastTimer: null,

  hydrate: () => {
    if (typeof window === "undefined") return;
    const stored = (window.localStorage.getItem(THEME_KEY) as Theme) || null;
    const prefersDark =
      window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme: Theme = stored || (prefersDark ? "dark" : "light");
    // Preview is the only supported workflow. Remove the legacy mode choice so
    // a previously saved "instant" value can never bypass preview.
    window.localStorage.removeItem(LEGACY_WORKFLOW_KEY);
    let pttBindings = DEFAULT_PTT;
    try {
      const raw = window.localStorage.getItem(PTT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every((k) => typeof k === "string")) {
          pttBindings = parsed;
        }
      }
    } catch {
      // corrupt value → fall back to the default binding
    }
    applyTheme(theme);
    set({ theme, pttBindings, mounted: true });
  },

  toggleTheme: () => {
    const next: Theme = get().theme === "light" ? "dark" : "light";
    window.localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
    set({ theme: next });
  },

  setTheme: (t) => {
    window.localStorage.setItem(THEME_KEY, t);
    applyTheme(t);
    set({ theme: t });
  },

  toggleSidebar: () => set((s) => ({ sidebarExpanded: !s.sidebarExpanded })),

  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),

  addPttBinding: (key) => {
    if (!key) return;
    const next = get().pttBindings.includes(key)
      ? get().pttBindings
      : [...get().pttBindings, key];
    window.localStorage.setItem(PTT_KEY, JSON.stringify(next));
    set({ pttBindings: next });
  },

  removePttBinding: (key) => {
    const next = get().pttBindings.filter((k) => k !== key);
    window.localStorage.setItem(PTT_KEY, JSON.stringify(next));
    set({ pttBindings: next });
  },

  acquireMicrophone: (owner) => {
    if (get().microphoneOwner) return false;
    set({ microphoneOwner: owner });
    return true;
  },

  releaseMicrophone: (owner) => {
    if (get().microphoneOwner === owner) set({ microphoneOwner: null });
  },

  notify: (msg) => {
    const prev = get()._toastTimer;
    if (prev) clearTimeout(prev);
    const timer = setTimeout(() => set({ toast: null, _toastTimer: null }), 2200);
    set({ toast: msg, _toastTimer: timer });
  },
}));
