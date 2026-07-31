import { describe, expect, it } from "vitest";
import { analyzeSpeechActivity, encodePcmWavMono16 } from "./audio";

const SAMPLE_RATE = 16_000;

function samples(seconds: number, valueAt: (time: number) => number): Float32Array {
  return Float32Array.from(
    { length: Math.round(seconds * SAMPLE_RATE) },
    (_, index) => valueAt(index / SAMPLE_RATE)
  );
}

describe("analyzeSpeechActivity", () => {
  it("rejects digital silence", () => {
    const result = analyzeSpeechActivity(new Float32Array(SAMPLE_RATE), SAMPLE_RATE);
    expect(result.detected).toBe(false);
    expect(result.activeMs).toBe(0);
  });

  it("rejects steady low-level room noise", () => {
    let seed = 7;
    const noise = samples(1, () => {
      seed = (seed * 16807) % 2147483647;
      return ((seed / 2147483647) * 2 - 1) * 0.004;
    });
    expect(analyzeSpeechActivity(noise, SAMPLE_RATE).detected).toBe(false);
  });

  it("rejects a click without sustained speech", () => {
    const click = new Float32Array(SAMPLE_RATE);
    click[SAMPLE_RATE / 2] = 0.9;
    expect(analyzeSpeechActivity(click, SAMPLE_RATE).detected).toBe(false);
  });

  it("rejects a take that is too short to contain a useful utterance", () => {
    const shortTone = samples(0.15, (time) => Math.sin(2 * Math.PI * 180 * time) * 0.08);
    expect(analyzeSpeechActivity(shortTone, SAMPLE_RATE).detected).toBe(false);
  });

  it("accepts a speech-like voiced segment surrounded by silence", () => {
    const utterance = samples(1.1, (time) => {
      if (time < 0.25 || time > 0.9) return 0;
      const envelope = 0.55 + 0.45 * Math.sin(2 * Math.PI * 4 * time) ** 2;
      return Math.sin(2 * Math.PI * 185 * time) * 0.055 * envelope;
    });
    const result = analyzeSpeechActivity(utterance, SAMPLE_RATE);
    expect(result.detected).toBe(true);
    expect(result.activeMs).toBeGreaterThanOrEqual(100);
  });
});

describe("encodePcmWavMono16", () => {
  it("encodes live 48 kHz microphone samples directly as a 16 kHz mono WAV", () => {
    const input = Float32Array.from(
      { length: 48_000 },
      (_, index) => Math.sin((2 * Math.PI * 220 * index) / 48_000) * 0.1
    );

    const wav = encodePcmWavMono16(input, 48_000, 16_000);
    const bytes = new Uint8Array(wav);
    const view = new DataView(wav);
    const ascii = (start: number, length: number) =>
      String.fromCharCode(...bytes.slice(start, start + length));

    expect(ascii(0, 4)).toBe("RIFF");
    expect(ascii(8, 4)).toBe("WAVE");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(wav.byteLength).toBe(44 + 16_000 * 2);
  });
});
