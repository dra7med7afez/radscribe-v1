export default () => ({
  port: parseInt(process.env.PORT || "4000", 10),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || "dev-access-secret-change-me",
    refreshSecret: process.env.JWT_REFRESH_SECRET || "dev-refresh-secret-change-me",
    accessTtl: process.env.JWT_ACCESS_TTL || "15m",
    refreshTtl: process.env.JWT_REFRESH_TTL || "7d",
    issuer: process.env.JWT_ISSUER || "radscribe-api",
    audience: process.env.JWT_AUDIENCE || "radscribe-web",
  },
  auth: {
    // self-service signup switch — set ALLOW_REGISTRATION=false to make the
    // instance invite-only (accounts then come from the admin Users page)
    allowRegistration:
      (process.env.ALLOW_REGISTRATION ?? (process.env.NODE_ENV === "production" ? "false" : "true")) ===
      "true",
  },
  google: {
    // OAuth client id used to verify Google Sign-In ID tokens (empty = disabled)
    clientId: process.env.GOOGLE_CLIENT_ID || "",
  },
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL || "60", 10),
    limit: parseInt(process.env.THROTTLE_LIMIT || "120", 10),
  },
  // §12 AI config
  ai: {
    provider: process.env.AI_PROVIDER || "gemini",
    defaultModel: process.env.AI_DEFAULT_MODEL || "gemini-3.1-flash-lite",
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    geminiModel: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
    geminiTranscriptionModel:
      process.env.GEMINI_TRANSCRIPTION_MODEL || "gemini-3.6-flash",
    // Production AI is disabled unless the operator explicitly confirms that
    // the configured provider contract permits this deployment's PHI.
    phiApproved: process.env.AI_PHI_APPROVED === "true",
  },
  // symmetric key used to encrypt integration credentials at rest
  credentialsKey: process.env.CREDENTIALS_KEY || "dev-credentials-key-32-bytes-long!!",
});
