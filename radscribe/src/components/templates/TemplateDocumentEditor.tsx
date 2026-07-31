"use client";

import { useRef } from "react";
import type { JSONContent } from "@tiptap/core";
import DocumentBodyEditor from "@/components/report-editor/DocumentBodyEditor";
import { cloneDocument } from "@/lib/template-document";

export default function TemplateDocumentEditor({
  initialDocument,
  onChange,
}: {
  initialDocument: JSONContent;
  onChange: (document: JSONContent) => void;
}) {
  const initial = useRef(cloneDocument(initialDocument));
  return (
    <DocumentBodyEditor
      initialContent={initial.current}
      onUpdate={(editor) => onChange(cloneDocument(editor.getJSON()))}
    />
  );
}
