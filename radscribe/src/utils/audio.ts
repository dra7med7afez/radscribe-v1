// ============================================================
// utils/audio.ts (§12). Normal dictations are captured directly as PCM and
// encoded to mono 16-bit WAV on stop. MediaRecorder remains as a bounded
// fallback for long takes and browsers that cannot expose live PCM.
// ============================================================

export interface Recording {
  stop: () => Promise<{ base64: string; mimeType: string } | null>;
  cancel: () => void;
  // Normalized, local-only microphone energy for the live waveform. Raw audio
  // never leaves the recorder through this API.
  getLevel: () => number;
}

const MIN_RECORDING_MS = 250;
const FRAME_MS = 20;
const MIN_ACTIVE_MS = 100;
const MIN_PEAK = 0.02;
const MIN_FRAME_RMS = 0.006;
// Keep the fast in-memory PCM path bounded. Longer recordings fall back to the
// MediaRecorder decode path so a forgotten open microphone cannot consume
// hundreds of megabytes of Float32 samples.
const MAX_FAST_PCM_SECONDS = 120;

export interface SpeechActivity {
  durationMs: number;
  peak: number;
  rms: number;
  activeMs: number;
  detected: boolean;
}

/**
 * Lightweight client-side voice activity detection. MediaRecorder produces a
 * perfectly valid file even when nobody speaks; sending that silence to an
 * ASR model can produce a hallucinated transcript. We require sustained audio
 * above both an absolute floor and the recording's own background-noise floor.
 */
export function analyzeSpeechActivity(
  samples: Float32Array,
  sampleRate: number
): SpeechActivity {
  const durationMs = sampleRate > 0 ? (samples.length / sampleRate) * 1000 : 0;
  if (!samples.length || sampleRate <= 0) {
    return { durationMs: 0, peak: 0, rms: 0, activeMs: 0, detected: false };
  }

  let peak = 0;
  let sumSquares = 0;
  for (const sample of samples) {
    const amplitude = Math.abs(sample);
    if (amplitude > peak) peak = amplitude;
    sumSquares += sample * sample;
  }
  const rms = Math.sqrt(sumSquares / samples.length);

  const frameSize = Math.max(1, Math.round((sampleRate * FRAME_MS) / 1000));
  const frameLevels: number[] = [];
  for (let start = 0; start < samples.length; start += frameSize) {
    const end = Math.min(samples.length, start + frameSize);
    let frameSquares = 0;
    for (let index = start; index < end; index += 1) {
      frameSquares += samples[index] * samples[index];
    }
    frameLevels.push(Math.sqrt(frameSquares / (end - start)));
  }

  const sortedLevels = [...frameLevels].sort((a, b) => a - b);
  const noiseFloor = sortedLevels[Math.floor((sortedLevels.length - 1) * 0.2)] ?? 0;
  const activityThreshold = Math.max(MIN_FRAME_RMS, noiseFloor * 2.2);
  let activeFrames = 0;
  let longestRun = 0;
  let currentRun = 0;
  for (const level of frameLevels) {
    if (level >= activityThreshold) {
      activeFrames += 1;
      currentRun += 1;
      longestRun = Math.max(longestRun, currentRun);
    } else {
      currentRun = 0;
    }
  }

  const activeMs = activeFrames * FRAME_MS;
  const sustainedMs = longestRun * FRAME_MS;
  const detected =
    durationMs >= MIN_RECORDING_MS &&
    peak >= MIN_PEAK &&
    rms >= MIN_FRAME_RMS / 2 &&
    activeMs >= MIN_ACTIVE_MS &&
    sustainedMs >= MIN_ACTIVE_MS / 2;

  return { durationMs, peak, rms, activeMs, detected };
}

function downmixToMono(audioBuffer: AudioBuffer): Float32Array {
  const numCh = audioBuffer.numberOfChannels;
  const srcLen = audioBuffer.length;
  if (numCh === 1) return audioBuffer.getChannelData(0);

  const mono = new Float32Array(srcLen);
  const inv = 1 / numCh;
  for (let channel = 0; channel < numCh; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let index = 0; index < srcLen; index += 1) mono[index] += data[index] * inv;
  }
  return mono;
}

export async function startRecording(): Promise<Recording> {
  const AudioCtx =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  let audioContext: AudioContext | null = null;
  if (AudioCtx) {
    try {
      // Create/resume during the direct user gesture while the permission
      // request runs, instead of paying this setup cost after access resolves.
      audioContext = new AudioCtx({ latencyHint: "interactive" });
      if (audioContext.state === "suspended") void audioContext.resume();
    } catch {
      audioContext = null;
    }
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (error) {
    if (audioContext) void audioContext.close();
    throw error;
  }

  let mr: MediaRecorder;
  try {
    mr = new MediaRecorder(stream, { audioBitsPerSecond: 64_000 });
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    if (audioContext) void audioContext.close();
    throw error;
  }
  const chunks: BlobPart[] = [];
  let cancelled = false;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let processorNode: ScriptProcessorNode | null = null;
  let analyser: AnalyserNode | null = null;
  let meterData: Uint8Array<ArrayBuffer> | null = null;
  let captureSampleRate = 0;
  let pcmChunks: Float32Array[] = [];
  let pcmSampleCount = 0;
  let pcmOverflow = false;
  if (audioContext) {
    try {
      // Some browsers suspend the context again while their permission prompt
      // is open. Ensure processing is live before wiring the stream.
      if (audioContext.state === "suspended") await audioContext.resume();
      captureSampleRate = audioContext.sampleRate;
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      meterData = new Uint8Array(analyser.fftSize);
      sourceNode = audioContext.createMediaStreamSource(stream);
      sourceNode.connect(analyser);

      // Capture the same live PCM frames used by the meter. Normal dictations
      // can therefore be validated and encoded immediately on stop instead of
      // waiting for the browser to decode its own MediaRecorder file first.
      processorNode = audioContext.createScriptProcessor(2048, 1, 1);
      processorNode.onaudioprocess = (event) => {
        event.outputBuffer.getChannelData(0).fill(0);
        if (cancelled || pcmOverflow) return;
        const input = event.inputBuffer.getChannelData(0);
        const maxSamples = captureSampleRate * MAX_FAST_PCM_SECONDS;
        if (pcmSampleCount + input.length > maxSamples) {
          pcmOverflow = true;
          pcmChunks = [];
          pcmSampleCount = 0;
          return;
        }
        pcmChunks.push(new Float32Array(input));
        pcmSampleCount += input.length;
      };
      sourceNode.connect(processorNode);
      processorNode.connect(audioContext.destination);
    } catch {
      // Recording can continue even if this browser cannot provide a meter.
      processorNode?.disconnect();
      sourceNode?.disconnect();
      processorNode = null;
      sourceNode = null;
      analyser = null;
      meterData = null;
      if (audioContext) void audioContext.close();
      audioContext = null;
    }
  }
  mr.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  mr.start(250);
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (processorNode) {
      processorNode.onaudioprocess = null;
      processorNode.disconnect();
    }
    sourceNode?.disconnect();
    analyser?.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    if (audioContext) void audioContext.close();
  };

  return {
    getLevel: () => {
      if (!analyser || !meterData) return 0;
      analyser.getByteTimeDomainData(meterData);
      let sumSquares = 0;
      for (const sample of meterData) {
        const centered = (sample - 128) / 128;
        sumSquares += centered * centered;
      }
      const rms = Math.sqrt(sumSquares / meterData.length);
      return Math.min(1, Math.max(0, rms * 8));
    },
    stop: () =>
      new Promise((resolve) => {
        mr.onstop = async () => {
          cleanup();
          if (cancelled) return resolve(null);
          try {
            if (!pcmOverflow && pcmSampleCount > 0 && captureSampleRate > 0) {
              const samples = mergePcmChunks(pcmChunks, pcmSampleCount);
              pcmChunks = [];
              pcmSampleCount = 0;
              if (!analyzeSpeechActivity(samples, captureSampleRate).detected) {
                return resolve(null);
              }
              const wav = encodePcmWavMono16(samples, captureSampleRate, 16_000);
              const base64 = await blobToBase64(new Blob([wav]));
              return resolve({ base64, mimeType: "audio/wav" });
            }
            const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
            if (blob.size < 1024) return resolve(null); // too short → no speech
            const base64 = await blobToWavBase64(blob);
            if (!base64) return resolve(null);
            resolve({ base64, mimeType: "audio/wav" });
          } catch (e) {
            // an undecodable/empty take is "no speech", not a hard failure
            console.warn("[audio] could not encode recording:", e);
            resolve(null);
          }
        };
        if (mr.state !== "inactive") mr.stop();
        else resolve(null);
      }),
    cancel: () => {
      cancelled = true;
      cleanup();
      if (mr.state !== "inactive") mr.stop();
    },
  };
}

function mergePcmChunks(chunks: Float32Array[], totalLength: number): Float32Array {
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

export async function blobToWavBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  // Decode inside a 16 kHz OfflineAudioContext: the browser resamples natively
  // during decode, so samples arrive already at ASR rate — ~3x less memory than
  // decoding at the mic's 44.1/48 kHz and no per-sample JS resample loop. Unlike
  // a real AudioContext, an offline one takes no audio-device handle (browsers
  // cap concurrent hardware contexts) and needs no close().
  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as Window & {
      webkitOfflineAudioContext?: typeof OfflineAudioContext;
    }).webkitOfflineAudioContext;
  if (!OfflineCtx) throw new Error("Offline audio processing is unavailable");
  const ctx = new OfflineCtx(1, 1, 16000);
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  if (!analyzeSpeechActivity(downmixToMono(audioBuffer), audioBuffer.sampleRate).detected) {
    return "";
  }
  const wav = encodeWavMono16(audioBuffer, 16000);
  return blobToBase64(new Blob([wav]));
}

// Encode an AudioBuffer to a mono 16-bit PCM WAV, resampled to targetRate.
export function encodeWavMono16(audioBuffer: AudioBuffer, targetRate = 16000): ArrayBuffer {
  return encodePcmWavMono16(downmixToMono(audioBuffer), audioBuffer.sampleRate, targetRate);
}

export function encodePcmWavMono16(
  mono: Float32Array,
  srcRate: number,
  targetRate = 16000
): ArrayBuffer {
  const srcLen = mono.length;
  // Linear-interpolation resample to targetRate
  const rate = targetRate && targetRate < srcRate ? targetRate : srcRate;
  let samples = mono;
  if (rate !== srcRate) {
    const ratio = rate / srcRate;
    const outLen = Math.max(1, Math.round(srcLen * ratio));
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const pos = i / ratio;
      const i0 = Math.floor(pos);
      const i1 = Math.min(i0 + 1, srcLen - 1);
      out[i] = mono[i0] + (mono[i1] - mono[i0]) * (pos - i0);
    }
    samples = out;
  }

  const len = samples.length;
  const buffer = new ArrayBuffer(44 + len * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + len * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, len * 2, true);

  let off = 44;
  for (let i = 0; i < len; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return buffer;
}

// Blob → base64 with the browser's native encoder (FileReader data URL).
// The old path built the string in JS — a 32k-element array + fromCharCode per
// chunk, concatenated across tens of MB for a long take — churning memory and
// blocking the main thread for seconds.
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("base64 encode failed"));
    reader.readAsDataURL(blob);
  });
}
