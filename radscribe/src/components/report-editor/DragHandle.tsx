"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import type { Editor } from "@tiptap/react";
import { dragUnitAt, performMove, validSlots, type DragUnit } from "./drag";

// ============================================================
// DragHandle — the grip beside the hovered block, same look as the
// report's original drag handle. Hovering a paragraph, heading or list
// row shows the grip at its left edge; dragging it moves that node —
// and a heading moves together with its entire section — via a single
// ProseMirror transaction (see drag.ts). While dragging, the source
// dims (rd-dragging) and an accent hairline marks the drop target.
// ============================================================

interface Grip {
  pos: number; // start position of the hovered node
  top: number; // wrapper-local coordinates
  left: number;
}

// Horizontal gap between the grip and the node's left edge. List rows need
// extra room so the grip clears the bullet in the list gutter (the ::marker
// draws outside the li box, in the list's padding).
const BLOCK_GAP = 30;
const LIST_ROW_GAP = 44;

interface Slot {
  pos: number;
  top: number;
  left: number;
  width: number;
}

interface DragSession {
  unit: DragUnit;
  slots: Slot[];
  startX: number;
  startY: number;
  started: boolean;
  slot: Slot | null;
  doms: HTMLElement[]; // the dimmed source elements
}

const isElement = (n: unknown): n is HTMLElement => n instanceof HTMLElement;

export default function DragHandle({ editor }: { editor: Editor }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [grip, setGrip] = useState<Grip | null>(null);
  const [indicator, setIndicator] = useState<Slot | null>(null);
  const dragRef = useRef<DragSession | null>(null);

  const wrapperRect = () =>
    rootRef.current?.parentElement?.getBoundingClientRect() ?? null;

  // ---- hover: find the block / list row under the pointer's Y ----------

  const targetAt = useCallback(
    (clientY: number): { pos: number; dom: HTMLElement; listItem: boolean } | null => {
      if (editor.isDestroyed) return null;
      const { view, state } = editor;
      let found: { pos: number; node: PMNodeLike; dom: HTMLElement } | null = null;
      type PMNodeLike = (typeof state.doc)["firstChild"] & object;
      state.doc.forEach((child, offset) => {
        const dom = view.nodeDOM(offset);
        if (!isElement(dom)) return;
        const r = dom.getBoundingClientRect();
        if (clientY >= r.top && clientY <= r.bottom) {
          found = { pos: offset, node: child, dom };
        }
      });
      if (!found) return null;
      const top = found as { pos: number; node: PMNodeLike; dom: HTMLElement };
      const typeName = (top.node as { type: { name: string } }).type.name;
      if (typeName !== "bulletList" && typeName !== "orderedList") {
        return { pos: top.pos, dom: top.dom, listItem: false };
      }
      // inside a list: the innermost row under the pointer is the unit
      let li: { pos: number; dom: HTMLElement } | null = null;
      (top.node as unknown as {
        descendants: (fn: (n: { type: { name: string } }, p: number) => boolean) => void;
      }).descendants((n, p) => {
        if (n.type.name !== "listItem") return true;
        const abs = top.pos + 1 + p;
        const dom = editor.view.nodeDOM(abs);
        if (isElement(dom)) {
          const r = dom.getBoundingClientRect();
          if (clientY >= r.top && clientY <= r.bottom) li = { pos: abs, dom };
        }
        return true;
      });
      return li
        ? { ...(li as { pos: number; dom: HTMLElement }), listItem: true }
        : { pos: top.pos, dom: top.dom, listItem: false };
    },
    [editor]
  );

  const refreshGrip = useCallback(
    (clientY: number) => {
      if (dragRef.current?.started) return; // frozen while dragging
      const wrap = wrapperRect();
      if (!wrap) return;
      const target = targetAt(clientY);
      if (!target) {
        setGrip(null);
        return;
      }
      const r = target.dom.getBoundingClientRect();
      const gap = target.listItem ? LIST_ROW_GAP : BLOCK_GAP;
      setGrip({
        pos: target.pos,
        top: r.top - wrap.top + 1,
        left: Math.max(r.left - wrap.left - gap, -36),
      });
    },
    [targetAt]
  );

  useEffect(() => {
    const root = rootRef.current;
    const scroller = root?.closest<HTMLElement>(".report-doc") || root?.parentElement;
    if (!scroller) return;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        refreshGrip(e.clientY);
      });
    };
    const onLeave = () => {
      if (!dragRef.current) setGrip(null);
    };
    scroller.addEventListener("mousemove", onMove);
    scroller.addEventListener("mouseleave", onLeave);
    return () => {
      scroller.removeEventListener("mousemove", onMove);
      scroller.removeEventListener("mouseleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [refreshGrip]);

  // ---- drag session -----------------------------------------------------

  const cleanupDrag = useCallback(() => {
    const session = dragRef.current;
    if (session) for (const dom of session.doms) dom.classList.remove("rd-dragging");
    dragRef.current = null;
    setIndicator(null);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dragRef.current) cleanupDrag();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cleanupDrag]);

  // Geometry of every legal drop boundary, in wrapper-local coordinates
  // (stable while the container scrolls).
  const computeSlots = useCallback(
    (unit: DragUnit): Slot[] => {
      const wrap = wrapperRect();
      if (!wrap) return [];
      const { view, state } = editor;
      const contentRect = view.dom.getBoundingClientRect();
      const out: Slot[] = [];
      for (const pos of validSlots(state.doc, unit)) {
        const $pos = state.doc.resolve(pos);
        let y: number | null = null;
        if ($pos.index() < $pos.parent.childCount) {
          const dom = view.nodeDOM(pos);
          if (isElement(dom)) y = dom.getBoundingClientRect().top;
        } else if ($pos.index() > 0) {
          const before = $pos.parent.child($pos.index() - 1);
          const dom = view.nodeDOM(pos - before.nodeSize);
          if (isElement(dom)) y = dom.getBoundingClientRect().bottom;
        }
        if (y === null) continue;
        let left = contentRect.left;
        let width = contentRect.width;
        if ($pos.depth > 0) {
          const listDom = view.nodeDOM($pos.before($pos.depth));
          if (isElement(listDom)) {
            const r = listDom.getBoundingClientRect();
            left = r.left;
            width = r.width;
          }
        }
        out.push({
          pos,
          top: y - wrap.top,
          left: left - wrap.left,
          width,
        });
      }
      return out;
    },
    [editor]
  );

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!grip || editor.isDestroyed || !editor.isEditable) return;
    e.preventDefault(); // the grip must not move the caret
    const unit = dragUnitAt(editor.state.doc, grip.pos);
    if (!unit) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      unit,
      slots: computeSlots(unit),
      startX: e.clientX,
      startY: e.clientY,
      started: false,
      slot: null,
      doms: [],
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const session = dragRef.current;
    if (!session || editor.isDestroyed) return;
    if (!session.started) {
      // a drag must not start from the click that places the caret
      if (Math.hypot(e.clientX - session.startX, e.clientY - session.startY) < 5) return;
      session.started = true;
      const { view, state } = editor;
      state.doc.forEach((_node, offset) => {
        if (offset >= session.unit.from && offset < session.unit.to) {
          const dom = view.nodeDOM(offset);
          if (isElement(dom)) session.doms.push(dom);
        }
      });
      if (session.unit.kind === "listItem") {
        const dom = editor.view.nodeDOM(session.unit.from);
        session.doms = isElement(dom) ? [dom] : [];
      }
      for (const dom of session.doms) dom.classList.add("rd-dragging");
    }

    const wrap = wrapperRect();
    if (!wrap) return;
    const localY = e.clientY - wrap.top;
    let best: Slot | null = null;
    for (const slot of session.slots) {
      if (!best || Math.abs(slot.top - localY) < Math.abs(best.top - localY)) best = slot;
    }
    session.slot = best;
    setIndicator(best);

    // keep the drag usable on long reports: nudge the scroller near edges
    const scroller = rootRef.current?.closest<HTMLElement>(".report-doc");
    if (scroller) {
      const r = scroller.getBoundingClientRect();
      if (e.clientY < r.top + 40) scroller.scrollTop -= 10;
      else if (e.clientY > r.bottom - 40) scroller.scrollTop += 10;
    }
  };

  const onPointerUp = () => {
    const session = dragRef.current;
    cleanupDrag();
    if (!session?.started || !session.slot || editor.isDestroyed) return;
    performMove(editor, session.unit, session.slot.pos);
    setGrip(null);
  };

  return (
    <div ref={rootRef} contentEditable={false}>
      {editor.isEditable && grip && (
        <button
          type="button"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={cleanupDrag}
          className="grip absolute z-10 flex cursor-grab touch-none items-center rounded p-0.5 transition active:cursor-grabbing"
          style={{ color: "var(--text)", height: "1.625em", top: grip.top, left: grip.left }}
          aria-label="Drag to reorder"
        >
          <GripVertical size={15} />
        </button>
      )}
      {indicator && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-10 h-px"
          style={{
            top: indicator.top,
            left: indicator.left,
            width: indicator.width,
            background: "var(--accent)",
          }}
        />
      )}
    </div>
  );
}
