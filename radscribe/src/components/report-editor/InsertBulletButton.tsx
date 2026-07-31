"use client";

import { useEffect, useState } from "react";
import { ChevronDown, List } from "lucide-react";
import { useEditorRegistry } from "./editor-context";
import { BULLET_LIST_OPTIONS, type BulletListStyle, type BulletShape } from "@/lib/bullets";
import { cn } from "@/lib/utils";

// Bullets — a Word-style split button, DISTINCT from the list-style
// gallery. The main button TOGGLES a real TipTap bulletList on the selected
// paragraph(s), using the most recently picked marker; the attached arrow
// opens the bullet library and applies the chosen marker (the bulletList
// node's listStyle attribute — see ReportBulletList) to the list, converting
// the selection into one first if needed. Enter continues the list and
// Tab / Shift-Tab nest it — StarterKit's list behavior, like Word.

const LAST_STYLE_KEY = "radscribe-last-bullet";

function lastStyle(): BulletListStyle {
  if (typeof window === "undefined") return BULLET_LIST_OPTIONS[0].style;
  const s = window.localStorage.getItem(LAST_STYLE_KEY) || "";
  return BULLET_LIST_OPTIONS.find((o) => o.style === s)?.style ?? BULLET_LIST_OPTIONS[0].style;
}

export default function InsertBulletButton({ preferredStyle }: { preferredStyle?: BulletShape }) {
  const registry = useEditorRegistry();
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<BulletListStyle>(lastStyle);

  useEffect(() => {
    if (preferredStyle) setStyle(preferredStyle);
  }, [preferredStyle]);

  const rememberStyle = (s: BulletListStyle) => {
    setStyle(s);
    if (typeof window !== "undefined") window.localStorage.setItem(LAST_STYLE_KEY, s);
  };

  // Main button — Word's Bullets toggle.
  const toggle = () => {
    registry.format((e) => {
      const chain = e.chain().focus().toggleBulletList();
      // a fresh list gets the remembered marker; toggling OFF leaves nothing to set
      if (!e.isActive("bulletList")) chain.updateAttributes("bulletList", { listStyle: style });
      chain.run();
    });
  };

  // Library pick — restyle the list (creating one if needed) and remember it.
  const applyStyle = (s: BulletListStyle) => {
    rememberStyle(s);
    registry.format((e) => {
      const chain = e.chain().focus();
      if (!e.isActive("bulletList")) chain.toggleBulletList();
      chain.updateAttributes("bulletList", { listStyle: s }).run();
    });
    setOpen(false);
  };

  return (
    <div className="relative flex">
      <button
        type="button"
        // preventDefault keeps the editor's selection/caret
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        title="Bullets"
        className="grid h-8 w-8 place-items-center rounded-l-lg transition hover:bg-[var(--hover)]"
        style={{ color: "var(--text)" }}
      >
        <List size={16} />
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        title="Bullet library"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "grid h-8 w-3.5 place-items-center rounded-r-lg transition",
          open ? "bg-[var(--active)]" : "hover:bg-[var(--hover)]"
        )}
        style={{ color: "var(--text-muted)" }}
      >
        <ChevronDown size={11} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="animate-in absolute left-0 top-full z-20 mt-1 flex gap-1 rounded-xl p-1.5"
            style={{ background: "var(--panel)", boxShadow: "var(--shadow-pop)" }}
          >
            {BULLET_LIST_OPTIONS.map((o) => (
              <button
                key={o.style}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyStyle(o.style)}
                title={`Bullet ${o.glyph}`}
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-lg text-[16px] leading-none transition hover:bg-[var(--hover)]",
                  o.style === style && "bg-[var(--active)]"
                )}
                style={{ color: "var(--text)" }}
              >
                {o.glyph}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
