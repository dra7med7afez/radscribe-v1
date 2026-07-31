import { useEffect, useRef } from "react";

// usePushToTalk — HOLD-to-talk over one or more keyboard bindings. Both the
// keyboard (Ctrl) and an external physical button that emulates a keyboard key
// are handled identically here: keydown starts dictation, keyup stops it.
//
// Robustness the radiology workflow needs:
//  • auto-repeat (keydown firing while held) is ignored — one start per hold
//  • a MODIFIER binding (Ctrl/Shift/Alt/Meta) works regardless of caret/focus,
//    but a second key cancels the take — that hold was a shortcut (Ctrl+S), not
//    speech
//  • a dedicated binding (a pedal's function key) always fires, even while typing
//  • losing the window (Alt-Tab, a prompt) releases the hold so the mic can't get
//    stuck open when the keyup never arrives

const MODIFIERS = new Set(["Control", "Shift", "Alt", "Meta"]);

export function usePushToTalk({
  getBindings,
  isEnabled,
  onStart,
  onStop,
  onCancel,
}: {
  // Getters, not values: read fresh per key event (an O(1) store read) so the
  // component never has to subscribe/re-render just to keep this hook current,
  // and the global listeners register exactly once per mount.
  getBindings: () => string[];
  isEnabled: () => boolean;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
}) {
  // Keep the latest callbacks/getters in a ref so listeners never read a stale
  // closure.
  const ref = useRef({ getBindings, isEnabled, onStart, onStop, onCancel });
  ref.current = { getBindings, isEnabled, onStart, onStop, onCancel };

  useEffect(() => {

    // The key currently holding the mic open, or null. `chordable` marks a
    // modifier hold that a subsequent keypress should cancel.
    let activeKey: string | null = null;
    let chordable = false;

    const release = (fn: () => void) => {
      activeKey = null;
      chordable = false;
      fn();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const { getBindings, isEnabled, onStart, onCancel } = ref.current;

      if (activeKey) {
        // Another key pressed mid-hold: if this was a modifier hold, it was a
        // shortcut chord (Ctrl+S) — discard the take rather than transcribe it.
        if (chordable && e.key !== activeKey) release(onCancel);
        return;
      }

      // Cheapest checks first — this runs on every keystroke in the app.
      if (e.repeat || !getBindings().includes(e.key) || !isEnabled()) return;

      const isMod = MODIFIERS.has(e.key);
      activeKey = e.key;
      chordable = isMod;
      // Non-modifier bindings (a pedal's dedicated key) shouldn't also type or
      // scroll the page; a bare modifier is left alone so real shortcuts survive.
      if (!isMod) e.preventDefault();
      onStart();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== activeKey) return;
      release(ref.current.onStop);
    };

    // If the window loses focus mid-hold the keyup can go missing — release so
    // the mic never sticks open.
    const onLostFocus = () => {
      if (activeKey) release(ref.current.onCancel);
    };
    const onVisibility = () => {
      if (document.hidden) onLostFocus();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onLostFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onLostFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      // Unmounting mid-hold shouldn't leave a dangling recording.
      if (activeKey) ref.current.onCancel();
    };
  }, []);
}
