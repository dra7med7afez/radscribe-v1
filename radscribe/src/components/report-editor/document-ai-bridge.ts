import type { DocumentEditResult, DocumentTreeNode } from "@/types";

interface DocumentAiBridge {
  tree: () => DocumentTreeNode;
  apply: (edits: DocumentEditResult[]) => DocumentEditResult[];
}

let bridge: DocumentAiBridge | null = null;

export function setDocumentAiBridge(next: DocumentAiBridge | null) {
  bridge = next;
}

export function getLiveDocumentTree(): DocumentTreeNode | null {
  return bridge?.tree() || null;
}

export function applyLiveDocumentEdits(edits: DocumentEditResult[]): number {
  return bridge?.apply(edits).length || 0;
}

export function applyLiveDocumentEditsWithTargets(
  edits: DocumentEditResult[]
): DocumentEditResult[] {
  return bridge?.apply(edits) || [];
}
