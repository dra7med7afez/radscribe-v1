import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

// AES-256-GCM encryption for integration credentials at rest.
function keyFrom(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export function encryptJson(value: unknown, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${data.toString("base64")}`;
}

export function decryptJson<T = any>(blob: string, secret: string): T | null {
  try {
    const [ivB64, tagB64, dataB64] = blob.split(".");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      keyFrom(secret),
      Buffer.from(ivB64, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const out = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]);
    return JSON.parse(out.toString("utf8"));
  } catch {
    return null;
  }
}

const SECRET_KEY_RE =
  /secret|key|password|token|cert|credential|authorization|bearer|private|passphrase|client.?secret/i;

// The placeholder clients see instead of a stored secret. A client that saves
// a form back unchanged echoes this exact string — writers must treat it as
// "keep the stored value", never as a new secret.
export const SECRET_MASK = "••••••••";

export function splitSecrets(config: Record<string, string>) {
  const publicCfg: Record<string, string> = {};
  const secrets: Record<string, string> = {};
  for (const [k, v] of Object.entries(config || {})) {
    if (SECRET_KEY_RE.test(k)) secrets[k] = v;
    else publicCfg[k] = v;
  }
  return { publicCfg, secrets };
}

// Re-attach masked placeholders so the client never sees plaintext secrets.
export function maskSecrets(
  publicCfg: Record<string, string>,
  secretKeys: string[]
): Record<string, string> {
  const out = { ...publicCfg };
  for (const k of secretKeys) out[k] = SECRET_MASK;
  return out;
}
