export type SelectedTextEditAction =
  | "concise"
  | "restructure"
  | "grammar"
  | "standardize"
  | "bullets"
  | "paragraph"
  | "split"
  | "combine"
  | "custom";

export interface VoiceEditCommand {
  action: SelectedTextEditAction;
  instruction: string;
}

export function parseVoiceEditCommand(command: string): VoiceEditCommand {
  const instruction = command.trim();
  const value = instruction.toLowerCase();

  if (/\b(?:shorter|concise|brief(?:er)?)\b/.test(value)) return { action: "concise", instruction };
  if (/\b(?:restructure|rephrase|reorder)\b/.test(value)) return { action: "restructure", instruction };
  if (/\b(?:grammar|proofread)\b/.test(value)) return { action: "grammar", instruction };
  if (/\b(?:standard(?:ize|ise)|terminology|academic)\b/.test(value)) {
    return { action: "standardize", instruction };
  }
  if (/\b(?:split findings?|separate bullets?|convert .*bullets?)\b/.test(value)) {
    return { action: /\bsplit\b/.test(value) ? "split" : "bullets", instruction };
  }
  if (/\b(?:combine(?:\s+(?:these|the))?\s+(?:findings?|bullets?)|one paragraph|convert .*paragraph)\b/.test(value)) {
    return { action: /\bcombine\b/.test(value) ? "combine" : "paragraph", instruction };
  }
  return { action: "custom", instruction };
}
