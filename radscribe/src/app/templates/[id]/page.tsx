"use client";

import { useParams } from "next/navigation";
import TemplateEditorPage from "@/components/templates/TemplateEditorPage";

export default function EditTemplatePage() {
  const params = useParams<{ id: string }>();
  return <TemplateEditorPage templateId={decodeURIComponent(params.id)} />;
}
