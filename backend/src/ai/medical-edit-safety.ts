export type ProtectedMedicalField =
  | "measurements or numbers"
  | "laterality"
  | "anatomical locations"
  | "negation"
  | "severity"
  | "comparison information";

const PROTECTED: Record<ProtectedMedicalField, RegExp> = {
  "measurements or numbers": /\b\d+(?:[.,]\d+)?(?:\s?(?:mm|cm|m|ml|cc|l|%|hu|kg|mg))?\b/gi,
  laterality: /\b(?:right|left|bilateral|midline)\b/gi,
  "anatomical locations": /\b(?:abdomen|acetabulum|adrenal|aorta|apex|appendix|atrium|axilla|bladder|bowel|brain|bronch(?:us|i)|cerebell(?:um|ar)|cervix|chest|colon|cortex|diaphragm|duodenum|esophagus|femur|frontal|gallbladder|heart|hepatic|hip|humerus|ileum|iliac|kidney|liver|lung|lungs|lobe|lumbar|mandible|mediastinum|neck|orbit|ovary|pancreas|parietal|pelvis|pleura|prostate|pulmonary|radius|rectum|renal|rib|sacrum|scapula|sinus|skull|spine|spleen|sternum|stomach|temporal|thorax|thyroid|tibia|trachea|ureter|urethra|uterus|ventricle|vertebra|wrist|edema|effusion)\b/gi,
  negation: /\b(?:no|not|without|absent|negative(?:\s+for)?)\b/gi,
  severity: /\b(?:mild|moderate|severe|marked|minimal|slight|significant|advanced)\b/gi,
  "comparison information": /\b(?:new|stable|unchanged|increased|decreased|improved|worsened|progressed|resolved|compared(?:\s+with|\s+to)?)\b/gi,
};

function normalized(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function terms(text: string, pattern: RegExp): Map<string, number> {
  const found = new Map<string, number>();
  for (const match of normalized(text).matchAll(pattern)) {
    const term = match[0].toLowerCase().replace(/\s+/g, " ");
    found.set(term, (found.get(term) || 0) + 1);
  }
  return found;
}

function changedTerms(before: Map<string, number>, after: Map<string, number>): string[] {
  const all = new Set([...before.keys(), ...after.keys()]);
  return [...all].filter((term) => (before.get(term) || 0) !== (after.get(term) || 0));
}

function explicitlyRequested(instruction: string, changed: string[]): boolean {
  const command = normalized(instruction);
  return (
    /\b(?:add|remove|delete|replace|change|correct|make|use|convert|split|combine|reorder)\b/.test(command) &&
    changed.every((term) => command.includes(term))
  );
}

export function unexpectedMedicalChanges(
  original: string,
  edited: string,
  instruction: string
): ProtectedMedicalField[] {
  if (/\b(?:remove|delete)\s+(?:(?:this|the)\s+)?(?:selected\s+)?(?:sentence|text|selection|finding)\b/i.test(instruction)) {
    return [];
  }
  return (Object.entries(PROTECTED) as [ProtectedMedicalField, RegExp][])
    .filter(([_, pattern]) => {
      const changed = changedTerms(terms(original, pattern), terms(edited, pattern));
      return changed.length > 0 && !explicitlyRequested(instruction, changed);
    })
    .map(([field]) => field);
}
