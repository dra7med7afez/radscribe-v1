"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { sectionsToDoc, docToStoreSections } from "./convert";
import { setPendingProjection, flushProjection } from "./projection-bridge";
import DocumentBodyEditor from "./DocumentBodyEditor";
import { useReportStore } from "@/store/reportStore";
import type { ReportSection } from "@/types";
import { applyDocumentEditsWithTargets, getDocumentTree } from "@/lib/document-ai";
import { setDocumentAiBridge } from "./document-ai-bridge";

// ============================================================
// ReportDocEditor — the report as ONE continuous, free-flowing TipTap
// document (Word-like). There are no section containers and nothing is
// locked: headings, paragraphs and lists are plain document nodes, and
// structure is derived from the text on demand (lib/report-doc).
//
// The doc is canonical while editing; the store's sections tree is a
// PROJECTION of it, refreshed on a short debounce so persistence,
// export and the AI flows keep working unchanged. External mutations
// (structuring results, template load, impression) still go through the
// store — the sync effect below loads the converted document JSON with
// editor.commands.setContent.
//
// The projection loop is broken by identity: sections arrays this
// component itself produced are remembered and never rebuilt from.
//
// The debounce would otherwise open a window where the store is behind
// the doc and a mutation could build on stale text — the store closes
// it by calling flushProjection() before every mutation (see
// projection-bridge).
// ============================================================

const PROJECT_DEBOUNCE_MS = 250;

// Load the store's report into the editor, keeping the caret near where it
// was. Recorded in PM history on purpose: Ctrl+Z after a dictation insert
// reverses it, exactly like any other edit.
function loadDoc(editor: Editor, sections: ReportSection[]) {
  const prevFrom = editor.state.selection.from;
  editor.commands.setContent(sectionsToDoc(sections), { emitUpdate: false });
  const { state, view } = editor;
  const pos = Math.min(prevFrom, state.doc.content.size);
  view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(pos))));
}

export default function ReportDocEditor() {
  const sections = useReportStore((s) => s.sections);
  const applyDocProjection = useReportStore((s) => s.applyDocProjection);
  const editable = useReportStore(
    (s) => s.activeReportStatus !== "FINAL" && !!s.activeReportId
  );

  // sections arrays produced by our own projection — never rebuild from those.
  // Seeded with the store's current array: the initial content is built from
  // that exact array, so the mount must not trigger a redundant rebuild.
  const ownProjection = useRef<ReportSection[] | null>(useReportStore.getState().sections);
  const editorRef = useRef<Editor | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialContent = useRef(
    useReportStore.getState().documentSeed ||
      sectionsToDoc(useReportStore.getState().sections)
  );

  // Project the live doc into the store. Runs on a debounce, or synchronously
  // when the store flushes it before a mutation.
  const runProjection = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || editor.isDestroyed) return;
    let projected: ReportSection[];
    try {
      projected = docToStoreSections(editor.getJSON(), useReportStore.getState().sections);
    } catch (err) {
      // A doc the converter can't project (an odd paste) must not take the
      // editor down mid-keystroke — keep the last good projection and carry on.
      console.error("report-editor: projection failed; keeping last good sections", err);
      return;
    }
    ownProjection.current = projected;
    applyDocProjection(projected);
  }, [applyDocProjection]);

  const scheduleProjection = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPendingProjection(runProjection);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      flushProjection(); // through the bridge, so the pending flush is cleared
    }, PROJECT_DEBOUNCE_MS);
  }, [runProjection]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      // Drop the pending flush rather than running it: on unmount the store has
      // already moved on (new template / new report) and projecting this doc
      // into it would overwrite that. Nothing is lost — the store flushed us
      // before it mutated.
      setPendingProjection(null);
    },
    []
  );

  const onEditorReady = useCallback((next: Editor | null) => {
    editorRef.current = next;
    setDocumentAiBridge(
      next
        ? {
            tree: () => getDocumentTree(next),
            apply: (edits) => applyDocumentEditsWithTargets(next, edits),
          }
        : null
    );
    setEditor(next);
  }, []);

  // external store changes (structuring results, template switch, impression)
  // → load the converted doc; our own projections are skipped.
  // Deferred out of the effect body: dispatching a PM transaction while React
  // is committing can make TipTap flush mid-render.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (sections === ownProjection.current) return;

    let cancelled = false;
    const attempt = () => {
      if (cancelled || editor.isDestroyed) return;
      // Never replace the doc mid-composition: IME and mobile autocorrect hold
      // state in the DOM that a doc swap corrupts. Wait for it to finish.
      if (editor.view.composing) {
        editor.view.dom.addEventListener("compositionend", attempt, { once: true });
        return;
      }
      if (useReportStore.getState().sections !== sections) return; // superseded
      loadDoc(editor, sections);
    };
    queueMicrotask(attempt);

    return () => {
      cancelled = true;
      if (!editor.isDestroyed) {
        editor.view?.dom?.removeEventListener("compositionend", attempt);
      }
    };
  }, [editor, sections]);

  // The relative wrapper is the positioning context for the drag grip and its
  // drop indicator — both scroll with the document.
  return (
    <DocumentBodyEditor
      initialContent={initialContent.current}
      onUpdate={scheduleProjection}
      onReady={onEditorReady}
      editable={editable}
    />
  );
}
