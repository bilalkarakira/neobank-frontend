/** A fresh unique key for one user action (one "attempt" at changing money). */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // very old browsers / insecure contexts: still unique enough for a per-user key
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
