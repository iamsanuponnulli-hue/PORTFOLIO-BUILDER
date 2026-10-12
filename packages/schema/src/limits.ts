/** Product limits shared by the app, security rules and functions. */
export const LIMITS = {
  maxProjectsPerUser: 5,
  maxResumeBytes: 10 * 1024 * 1024,
  maxImageBytes: 15 * 1024 * 1024,
  maxInspirationPerProject: 3,
  maxProjectNameLength: 80,
} as const;

/** Starter allowance (platform key, relayed). Tuned in Phase 2. */
export const STARTER = {
  generationsPerMonth: 3,
  editsPerMonth: 50,
  maxInputChars: 200_000,
  maxOutputTokens: 16_000,
} as const;
