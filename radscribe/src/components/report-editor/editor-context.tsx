"use client";

import {
  createContext,
  useContext,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Editor } from "@tiptap/react";

// ============================================================
// Editor registry — the toolbar and the caret mic drive the single
// continuous report editor. ReportDocEditor registers the editor on
// mount, so the toolbar can reach it (undo, format, headings) even
// before the user has put the caret in the document.
// ============================================================

interface RegistryValue {
  active: Editor | null;
  // called once on mount — the toolbar can then reach the editor
  registerEditor: (e: Editor | null) => void;
  format: (fn: (editor: Editor) => void) => void;
}

const EditorRegistryContext = createContext<RegistryValue | null>(null);

export function EditorRegistryProvider({ children }: { children: ReactNode }) {
  const activeRef = useRef<Editor | null>(null);
  const [active, setActive] = useState<Editor | null>(null);

  const registerEditor = useCallback((e: Editor | null) => {
    activeRef.current = e;
    setActive(e);
  }, []);

  const format = useCallback((fn: (editor: Editor) => void) => {
    if (activeRef.current) fn(activeRef.current);
  }, []);

  const value: RegistryValue = { active, registerEditor, format };

  return (
    <EditorRegistryContext.Provider value={value}>{children}</EditorRegistryContext.Provider>
  );
}

export function useEditorRegistry(): RegistryValue {
  const ctx = useContext(EditorRegistryContext);
  if (!ctx) throw new Error("useEditorRegistry must be used within EditorRegistryProvider");
  return ctx;
}
