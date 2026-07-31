"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import type { Editor } from "@tiptap/react";
import type { SelectedTextRange } from "@/lib/selected-text-edit-service";

export interface FloatingSelection extends SelectedTextRange {
  position: { x: number; y: number; below: boolean };
}

const TOOLBAR_WIDTH = 248;
const TOOLBAR_HEIGHT = 42;
const EDGE = 8;

// Keeps a snapshot of the editor's native selection and positions the toolbar
// from ProseMirror coordinates. This avoids coupling the floating controls to
// document structure (paragraphs, headings, lists and multi-line ranges work
// identically).
export function useTextSelectionManager(
  editor: Editor,
  toolbarRef: RefObject<HTMLElement | null>
): FloatingSelection | null {
  const [selection, setSelection] = useState<FloatingSelection | null>(null);

  const refresh = useCallback(() => {
    if (!editor || editor.isDestroyed || !editor.isFocused) {
      setSelection(null);
      return;
    }
    const { from, to, empty } = editor.state.selection;
    if (empty) {
      setSelection(null);
      return;
    }
    const text = editor.state.doc.textBetween(from, to, "\n");
    if (!text.trim()) {
      setSelection(null);
      return;
    }
    const start = editor.view.coordsAtPos(from);
    const end = editor.view.coordsAtPos(to);
    const toolbarWidth = toolbarRef.current?.offsetWidth || TOOLBAR_WIDTH;
    const toolbarHeight = toolbarRef.current?.offsetHeight || TOOLBAR_HEIGHT;
    const above = start.top - toolbarHeight - EDGE;
    const below = above < EDGE;
    const x = Math.max(
      EDGE,
      Math.min((start.left + end.right) / 2 - toolbarWidth / 2, window.innerWidth - toolbarWidth - EDGE)
    );
    setSelection({
      from,
      to,
      text,
      position: { x, y: below ? end.bottom + EDGE : above, below },
    });
  }, [editor, toolbarRef]);

  const hasSelection = selection !== null;
  useEffect(() => {
    editor.on("selectionUpdate", refresh);
    editor.on("focus", refresh);
    const onBlur = () => {
      // TipTap may report blur before a toolbar button receives focus. Defer
      // dismissal so keyboard and pointer interaction inside the toolkit keeps
      // the captured range alive.
      requestAnimationFrame(() => {
        if (!toolbarRef.current?.contains(document.activeElement)) setSelection(null);
      });
    };
    editor.on("blur", onBlur);
    const reposition = () => refresh();
    const dismissOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!editor.view.dom.contains(target) && !toolbarRef.current?.contains(target)) setSelection(null);
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    document.addEventListener("mousedown", dismissOutside, true);
    return () => {
      editor.off("selectionUpdate", refresh);
      editor.off("focus", refresh);
      editor.off("blur", onBlur);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("mousedown", dismissOutside, true);
    };
  }, [editor, refresh, toolbarRef]);

  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => refresh());
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, [refresh, toolbarRef, hasSelection]);

  return selection;
}
