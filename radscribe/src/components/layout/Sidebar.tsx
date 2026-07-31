"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  PanelLeft,
  LayoutGrid,
  ListChecks,
  LayoutTemplate,
  Workflow,
  BarChart3,
  Settings,
  Moon,
  Sun,
  CircleUserRound,
  CircleHelp,
  ShieldCheck,
  LogOut,
  ChevronUp,
  type LucideIcon,
} from "lucide-react";
import { useUiStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  icon: LucideIcon;
  href: string;
}

const TOP_NAV: NavItem[] = [
  { label: "Workspace", icon: LayoutGrid, href: "/" },
  { label: "Queue", icon: ListChecks, href: "/patients" },
  { label: "Templates", icon: LayoutTemplate, href: "/templates" },
  { label: "Integrations", icon: Workflow, href: "/integrations" },
  { label: "Analytics", icon: BarChart3, href: "/analytics" },
];

function NavRow({
  item,
  expanded,
  active,
}: {
  item: NavItem;
  expanded: boolean;
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={item.label}
      className={cn(
        "flex h-10 items-center rounded-xl transition",
        expanded ? "gap-3 px-3" : "justify-center px-0",
        !active && "hover:bg-[var(--hover)]"
      )}
      style={active ? { background: "var(--accent-soft)", color: "var(--accent)" } : { color: "var(--text)" }}
    >
      <Icon size={19} className="shrink-0" />
      {expanded && <span className="text-[13.5px] font-medium">{item.label}</span>}
    </Link>
  );
}

// Profile dropdown — merges the former Profile (Account), Settings, and theme
// toggle into one menu, plus Logout.
function ProfileMenu({ expanded }: { expanded: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const openSettings = useUiStore((s) => s.openSettings);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const name = user?.name || user?.email?.split("@")[0] || "Account";
  const initial = name.charAt(0).toUpperCase();
  const active = pathname.startsWith("/users");

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const itemCls =
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition hover:bg-[var(--hover)]";

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Profile"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex h-10 w-full items-center rounded-xl transition",
          expanded ? "gap-3 px-2" : "justify-center",
          !active && "hover:bg-[var(--hover)]"
        )}
        style={active || open ? { background: "var(--accent-soft)", color: "var(--accent)" } : { color: "var(--text)" }}
      >
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {initial}
        </span>
        {expanded && (
          <>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[13px] font-medium" style={{ color: "var(--text)" }}>
                {name}
              </span>
              {user?.role && (
                <span className="block truncate text-[11px]" style={{ color: "var(--text-subtle)" }}>
                  {user.role}
                </span>
              )}
            </span>
            <ChevronUp size={15} className={cn("shrink-0 transition-transform", !open && "rotate-180")} style={{ color: "var(--text-subtle)" }} />
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="animate-in absolute bottom-full left-0 z-30 mb-2 w-56 rounded-xl p-1.5"
          style={{ background: "var(--panel)", boxShadow: "var(--shadow-pop)" }}
        >
          <div className="px-2.5 py-1.5">
            <div className="truncate text-[13px] font-semibold" style={{ color: "var(--text)" }}>{name}</div>
            {user?.email && (
              <div className="truncate text-[11px]" style={{ color: "var(--text-muted)" }}>{user.email}</div>
            )}
          </div>
          <div className="my-1 h-px" style={{ background: "var(--ring)" }} />

          <button type="button" role="menuitem" onClick={() => go("/users")} className={itemCls} style={{ color: "var(--text)" }}>
            <CircleUserRound size={16} className="shrink-0" /> Profile
          </button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); openSettings(); }} className={itemCls} style={{ color: "var(--text)" }}>
            <Settings size={16} className="shrink-0" /> Settings
          </button>
          <button type="button" role="menuitem" onClick={() => toggleTheme()} className={itemCls} style={{ color: "var(--text)" }}>
            {theme === "dark" ? <Sun size={16} className="shrink-0" /> : <Moon size={16} className="shrink-0" />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>

          <div className="my-1 h-px" style={{ background: "var(--ring)" }} />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void logout();
            }}
            className={itemCls}
            style={{ color: "var(--abnormal)" }}
          >
            <LogOut size={16} className="shrink-0" /> Logout
          </button>
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const expanded = useUiStore((s) => s.sidebarExpanded);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" || pathname === "/reports" : pathname.startsWith(href);

  return (
    <aside
      className="flex h-screen shrink-0 flex-col px-3 py-6 transition-[width] duration-200 gap-5"
      style={{ width: expanded ? 220 : 72, background: "var(--canvas)" }}
    >
      {/* Minimal brand mark doubles as the sidebar collapse control. */}
      <button
        type="button"
        onClick={toggleSidebar}
        className={cn(
          "group flex h-11 items-center rounded-2xl transition hover:bg-[var(--hover)]",
          expanded ? "gap-3 px-1.5" : "justify-center"
        )}
        style={{ color: "var(--text)" }}
        aria-label="Toggle sidebar"
      >
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[13px] border shadow-sm"
          style={{
            color: "var(--accent)",
            background:
              "linear-gradient(145deg, color-mix(in srgb, var(--accent) 18%, var(--panel)), var(--panel))",
            borderColor: "color-mix(in srgb, var(--accent) 28%, var(--ring))",
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4.5 10h1.7l1.15-3.4 1.9 6.8 1.65-5 1.1 3.1h3.5"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M10 2.75a7.25 7.25 0 1 1-5.13 2.12"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              opacity=".72"
            />
          </svg>
        </span>
        {expanded && (
          <>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-[14px] font-semibold tracking-[-0.01em]">RadScribe</span>
              <span className="block text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-subtle)" }}>
                Reporting
              </span>
            </span>
            <PanelLeft size={16} className="shrink-0 opacity-45 transition group-hover:opacity-80" />
          </>
        )}
      </button>

      {/* Top nav */}
      <nav className="mt-4 flex flex-col gap-1">
        {TOP_NAV.map((item) => (
          <NavRow key={item.href} item={item} expanded={expanded} active={isActive(item.href)} />
        ))}
      </nav>

      {/* Bottom group */}
      <div className="mt-auto flex flex-col gap-1">
        <NavRow
          item={{ label: "Help Center", icon: CircleHelp, href: "/help" }}
          expanded={expanded}
          active={isActive("/help")}
        />

        {/* Profile / Settings / Theme / Logout — merged dropdown */}
        <ProfileMenu expanded={expanded} />

        <div
          className={cn(
            "mt-2 flex h-9 items-center rounded-xl",
            expanded ? "gap-2 px-3" : "justify-center"
          )}
          style={{ color: "var(--text-muted)" }}
          title="Secure session controls enabled"
        >
          <ShieldCheck size={17} className="shrink-0" />
          {expanded && <span className="text-[12px] font-medium">Secure session</span>}
        </div>
      </div>
    </aside>
  );
}
