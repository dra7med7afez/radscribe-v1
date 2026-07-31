// Box-around-text helpers (§10 Box tool). A finding stores its box INSIDE the
// item's text html (`<div class="text-box">…</div>` wrapping the whole text) —
// but visually the box must wrap the ENTIRE finding line (bullet + organ +
// text), like Word's paragraph border. Renderers (editor EditableFinding +
// export report-format) use these to detect a fully-boxed text and hoist the
// border to the whole line.

const BOX_WRAP_RE = /^\s*<div class="text-box"(?:\s[^>]*)?>([\s\S]*)<\/div>\s*$/;

// The inner html when `html` is entirely one text-box wrapper, else null.
export function unwrapTextBox(html: string): string | null {
  const m = BOX_WRAP_RE.exec(html || "");
  return m ? m[1] : null;
}

export function wrapTextBox(html: string): string {
  return `<div class="text-box">${html}</div>`;
}
