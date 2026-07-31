import { describe, expect, it } from "vitest";
import { parseVoiceEditCommand } from "./voice-edit-command-parser";

describe("voice edit command parser", () => {
  it.each([
    ["Make this shorter", "concise"],
    ["Restructure this finding", "restructure"],
    ["Correct the grammar", "grammar"],
    ["Use standard radiology terminology", "standardize"],
    ["Convert this into bullets", "bullets"],
    ["Convert this into one paragraph", "paragraph"],
    ["Split these findings into separate bullets", "split"],
    ["Combine these bullets", "combine"],
    ["Remove the word significant", "custom"],
  ])("maps %s", (command, action) => {
    expect(parseVoiceEditCommand(command).action).toBe(action);
  });
});
