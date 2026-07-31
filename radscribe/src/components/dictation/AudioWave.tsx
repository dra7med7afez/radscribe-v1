"use client";

const BAR_SHAPE = [0.34, 0.52, 0.76, 1, 0.72, 0.48, 0.82, 0.58, 0.36];

// A real microphone level drives these bars while listening. At rest they form
// a quiet waveform rather than running a decorative, unrelated animation.
export default function AudioWave({
  level = 0,
  active = false,
}: {
  level?: number;
  active?: boolean;
}) {
  const energy = Math.max(0, Math.min(1, level));
  return (
    <span
      className="inline-flex h-8 items-center gap-[3px]"
      aria-label={active ? "Live microphone level" : "Microphone ready"}
      role="img"
    >
      {BAR_SHAPE.map((weight, index) => (
        <span
          key={index}
          className="block w-[3px] rounded-full transition-[height,background-color,opacity] duration-75"
          style={{
            height: active ? `${5 + energy * 23 * weight}px` : `${4 + weight * 5}px`,
            background: active ? "#e5484d" : "var(--accent)",
            opacity: active ? 0.7 + weight * 0.3 : 0.28 + weight * 0.3,
          }}
        />
      ))}
    </span>
  );
}
