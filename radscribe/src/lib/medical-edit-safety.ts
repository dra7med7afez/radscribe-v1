// Medical facts that must not be changed by a generic rewrite. This is a
// deterministic guard around the LLM, not an attempt to infer a diagnosis.
// A requested change is allowed only when the affected protected terms occur
// explicitly in the instruction itself.

export type ProtectedMedicalField =
  | "measurements or numbers"
  | "laterality"
  | "anatomical locations"
  | "negation"
  | "severity"
  | "comparison information";

export interface MedicalEditValidation {
  safe: boolean;
  unexpectedFields: ProtectedMedicalField[];
}

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

function countTerms(text: string, pattern: RegExp): Map<string, number> {
  const terms = new Map<string, number>();
  for (const match of normalized(text).matchAll(pattern)) {
    const term = match[0].toLowerCase().replace(/\s+/g, " ");
    terms.set(term, (terms.get(term) || 0) + 1);
  }
  return terms;
}

function changedTerms(before: Map<string, number>, after: Map<string, number>): string[] {
  const terms = new Set([...before.keys(), ...after.keys()]);
  return [...terms].filter((term) => (before.get(term) || 0) !== (after.get(term) || 0));
}

function explicitlyRequested(instruction: string, terms: string[]): boolean {
  const command = normalized(instruction);
  // A rewrite request alone ("make concise", "improve grammar") may not
  // authorize a clinical fact change. The terms themselves must be spoken or
  // typed in the request, as in "replace right with left".
  return (
    /\b(?:add|remove|delete|replace|change|correct|make|use|convert|split|combine|reorder)\b/.test(command) &&
    terms.every((term) => command.includes(term))
  );
}

export function validateMedicalEdit(
  original: string,
  edited: string,
  instruction: string
): MedicalEditValidation {
  // The user may explicitly delete the entire selected sentence/finding. That
  // necessarily removes its protected facts, and is an authorized operation on
  // the selected range rather than an unrequested clinical alteration.
  if (/\b(?:remove|delete)\s+(?:(?:this|the)\s+)?(?:selected\s+)?(?:sentence|text|selection|finding)\b/i.test(instruction)) {
    return { safe: true, unexpectedFields: [] };
  }
  const unexpectedFields = (Object.entries(PROTECTED) as [ProtectedMedicalField, RegExp][])
    .filter(([, pattern]) => {
      const changed = changedTerms(countTerms(original, pattern), countTerms(edited, pattern));
      return changed.length > 0 && !explicitlyRequested(instruction, changed);
    })
    .map(([field]) => field);

  return { safe: unexpectedFields.length === 0, unexpectedFields };
}
