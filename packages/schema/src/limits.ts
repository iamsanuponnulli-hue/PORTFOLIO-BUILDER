/** Product limits shared by the app, security rules and functions. */
export const LIMITS = {
  maxProjectsPerUser: 5,
  maxResumeBytes: 10 * 1024 * 1024,
  maxImageBytes: 15 * 1024 * 1024,
  maxInspirationPerProject: 3,
  maxProjectNameLength: 80,
  /** Saved versions kept per project (older ones are deleted to stay in the free tier). */
  maxVersionsPerProject: 30,
} as const;
