/**
 * Shared utilities for Cloudflare Pages Functions (/api/*).
 * Prefixed directory `_lib` is ignored by the Pages Functions router.
 */

export const DEFAULT_RATE_LIMIT_MS = 5000;

/**
 * Return a non-cached JSON response.
 */
export function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

/**
 * Extract and validate an anonymous browser viewer/author token.
 */
export function getViewerToken(request, bodyToken) {
  const raw = bodyToken || request.headers.get("X-User-Token") || "";
  const clean = String(raw).trim().slice(0, 64);
  return /^[a-zA-Z0-9_-]{6,64}$/.test(clean) ? clean : "";
}

/**
 * Derive a privacy-preserving hashed IP rate-limit key.
 */
export async function getIpRateKey(request) {
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "";
  if (!ip) return "";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(ip.split(",")[0].trim())
  );
  const hex = Array.from(new Uint8Array(digest))
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `ip:${hex}`;
}

/**
 * Generate a sortable unique ID with a domain prefix.
 */
export function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Verify optional admin secret header against env.ADMIN_TOKEN.
 */
export function isAdminRequest(request, env) {
  const adminSecret = env && env.ADMIN_TOKEN ? String(env.ADMIN_TOKEN) : "";
  if (!adminSecret) return false;
  return request.headers.get("X-Admin-Token") === adminSecret;
}

/**
 * Prepare statement for the shared rate-limit table.
 */
export function rateLimitTableSql(db) {
  return db.prepare(`
    CREATE TABLE IF NOT EXISTS comment_rate_limits (
      rate_key TEXT PRIMARY KEY,
      last_post_at INTEGER NOT NULL
    )
  `);
}

/**
 * Check cooldown across rate-limit keys and record the current timestamp if allowed.
 */
export async function checkAndTouchRateLimit(db, keys, now, rateLimitMs = DEFAULT_RATE_LIMIT_MS) {
  const validKeys = keys.filter(Boolean);
  for (const key of validKeys) {
    const row = await db
      .prepare("SELECT last_post_at FROM comment_rate_limits WHERE rate_key = ?")
      .bind(key)
      .first();
    if (row && now - Number(row.last_post_at) < rateLimitMs) {
      return false;
    }
  }
  if (validKeys.length > 0) {
    await db.batch(
      validKeys.map((key) =>
        db
          .prepare(
            "INSERT INTO comment_rate_limits (rate_key, last_post_at) VALUES (?, ?) ON CONFLICT(rate_key) DO UPDATE SET last_post_at = excluded.last_post_at"
          )
          .bind(key, now)
      )
    );
  }
  return true;
}

/**
 * Enforce per-token and per-IP cooldown for POST endpoints, bypassing admins.
 */
export async function enforcePostRateLimit(db, request, authorToken, admin, now, options = {}) {
  if (admin) return true;
  const scopePrefix = options.scopePrefix || "";
  const rateLimitMs = options.rateLimitMs || DEFAULT_RATE_LIMIT_MS;
  const ipKey = await getIpRateKey(request);
  const keys = [
    authorToken ? `${scopePrefix}tok:${authorToken}` : "",
    ipKey ? `${scopePrefix}${ipKey}` : ""
  ];
  return checkAndTouchRateLimit(db, keys, now, rateLimitMs);
}
