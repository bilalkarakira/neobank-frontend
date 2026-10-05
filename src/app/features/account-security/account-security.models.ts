/** One login of this customer, as listed by the server. */
export interface Session {
  id: string;
  /** A readable label such as "Chrome on Windows". */
  device: string;
  ip: string | null;
  startedAt: string;
  /** The last time this login renewed its access token, so accurate to about 15 minutes. */
  lastActiveAt: string;
  expiresAt: string;
  /** True for the device that is making this request. */
  current: boolean;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}
