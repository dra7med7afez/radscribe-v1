"use client";

import { useEffect, useRef } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import type { JSONContent } from "@tiptap/core";
import { REPORT_EXTENSIONS } from "@/lib/report-doc";
import { useEditorRegistry } from "./editor-context";
import DragHandle from "./DragHandle";
import FloatingEditorToolbar from "./FloatingEditorToolbar";
import { ensureDocumentNodeIds } from "@/lib/document-ai";

const DOCUMENT_EXTENSIONS = [
  ...REPORT_EXTENSIONS,
  Placeholder.configure({
    placeholder: ({ node }) => (node.type.name === "paragraph" ? "Dictate or type…" : ""),
    includeChildren: true,
  }),
];

export default function DocumentBodyEditor({
  initialContent,
  onUpdate,
  onReady,
  editable = true,
}: {
  initialContent: JSONContent;
  onUpdate?: (editor: Editor) => void;
  onReady?: (editor: Editor | null) => void;
  editable?: boolean;
}) {
  const { registerEditor } = useEditorRegistry();
  const onUpdateRef = useRef(onUpdate);
  const onReadyRef = useRef(onReady);
  onUpdateRef.current = onUpdate;
  onReadyRef.current = onReady;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: DOCUMENT_EXTENSIONS,
    content: initialContent,
    editable,
    editorProps: { attributes: { class: "rd-doc focus:outline-none" } },
    onCreate: ({ editor: activeEditor }) => ensureDocumentNodeIds(activeEditor),
    onUpdate: ({ editor: activeEditor }) => onUpdateRef.current?.(activeEditor),
  });

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    registerEditor(editor ?? null);
    onReadyRef.current?.(editor ?? null);
    return () => {
      registerEditor(null);
      onReadyRef.current?.(null);
    };
  }, [editor, registerEditor]);

  return (
    <div className="relative">
      <EditorContent editor={editor} />
      {editor && editable && <DragHandle editor={editor} />}
      {editor && editable && <FloatingEditorToolbar editor={editor} />}
    </div>
  );
}
