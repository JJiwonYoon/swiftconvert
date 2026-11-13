/**
 * Cloudflare Pages Function: /api/comments
 * Anonymous shared comments backend backed by Cloudflare D1 (binding: DB).
 */

const VALID_TYPES = new Set(["praise", "feature", "bug", "question"]);
const VALID_SCOPE_RE = /^[a-z0-9-]+$/i;
const RATE_LIMIT_MS = 5000;
const MAX_COMMENTS = 200;

let schemaReadyPromise = null;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function getViewerToken(request, bodyToken) {
  const raw = bodyToken || request.headers.get("X-User-Token") || "";
  const clean = String(raw).trim().slice(0, 64);
  return /^[a-zA-Z0-9_-]{6,64}$/.test(clean) ? clean : "";
}

async function getIpRateKey(request) {
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

async function ensureSchema(db) {
  if (!schemaReadyPromise) {
    schemaReadyPromise = db
      .batch([
        db.prepare(`
          CREATE TABLE IF NOT EXISTS comments (
            id TEXT PRIMARY KEY,
            author_token TEXT NOT NULL,
            nick TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'question',
            scope TEXT NOT NULL DEFAULT 'all',
            text TEXT NOT NULL,
            likes INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
          )
        `),
        db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_comments_created_at
          ON comments (created_at DESC)
        `),
        db.prepare(`
          CREATE TABLE IF NOT EXISTS replies (
            id TEXT PRIMARY KEY,
            comment_id TEXT NOT NULL,
            author_token TEXT NOT NULL,
            nick TEXT NOT NULL,
            text TEXT NOT NULL,
            created_at INTEGER NOT NULL
          )
        `),
        db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_replies_comment_id
          ON replies (comment_id, created_at ASC)
        `),
        db.prepare(`
          CREATE TABLE IF NOT EXISTS comment_likes (
            comment_id TEXT NOT NULL,
            author_token TEXT NOT NULL,
            PRIMARY KEY (comment_id, author_token)
          )
        `),
        db.prepare(`
          CREATE TABLE IF NOT EXISTS comment_rate_limits (
            rate_key TEXT PRIMARY KEY,
            last_post_at INTEGER NOT NULL
          )
        `)
      ])
      .catch((err) => {
        schemaReadyPromise = null;
        throw err;
      });
  }
  return schemaReadyPromise;
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

async function checkAndTouchRateLimit(db, keys, now) {
  const validKeys = keys.filter(Boolean);
  for (const key of validKeys) {
    const row = await db
      .prepare("SELECT last_post_at FROM comment_rate_limits WHERE rate_key = ?")
      .bind(key)
      .first();
    if (row && now - Number(row.last_post_at) < RATE_LIMIT_MS) {
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

function isAdminRequest(request, env) {
  const adminSecret = env && env.ADMIN_TOKEN ? String(env.ADMIN_TOKEN) : "";
  if (!adminSecret) return false;
  return request.headers.get("X-Admin-Token") === adminSecret;
}

export async function onRequestGet(context) {
  const { env, request } = context;
  if (!env || !env.DB) {
    return jsonResponse({ ok: false, code: "DB_NOT_BOUND", error: "D1 DB binding missing" }, 503);
  }

  try {
    await ensureSchema(env.DB);
    const url = new URL(request.url);
    const viewerToken = getViewerToken(request, url.searchParams.get("token"));
    const admin = isAdminRequest(request, env);

    const { results: commentRows } = await env.DB.prepare(
      "SELECT id, author_token, nick, type, scope, text, likes, created_at FROM comments ORDER BY created_at DESC LIMIT ?"
    )
      .bind(MAX_COMMENTS)
      .all();

    const { results: replyRows } = await env.DB.prepare(
      "SELECT id, comment_id, author_token, nick, text, created_at FROM replies WHERE comment_id IN (SELECT id FROM comments ORDER BY created_at DESC LIMIT ?) ORDER BY created_at ASC"
    )
      .bind(MAX_COMMENTS)
      .all();

    const likedSet = new Set();
    if (viewerToken) {
      const { results: likeRows } = await env.DB.prepare(
        "SELECT comment_id FROM comment_likes WHERE author_token = ?"
      )
        .bind(viewerToken)
        .all();
      for (const row of likeRows || []) {
        likedSet.add(row.comment_id);
      }
    }

    const repliesByComment = new Map();
    for (const r of replyRows || []) {
      const list = repliesByComment.get(r.comment_id) || [];
      list.push({
        id: r.id,
        nick: r.nick,
        text: r.text,
        createdAt: Number(r.created_at),
        isMine: admin || Boolean(viewerToken && r.author_token === viewerToken)
      });
      repliesByComment.set(r.comment_id, list);
    }

    const comments = (commentRows || []).map((c) => ({
      id: c.id,
      nick: c.nick,
      type: c.type,
      scope: c.scope,
      text: c.text,
      likes: Number(c.likes || 0),
      liked: likedSet.has(c.id),
      createdAt: Number(c.created_at),
      isMine: admin || Boolean(viewerToken && c.author_token === viewerToken),
      replies: repliesByComment.get(c.id) || []
    }));

    return jsonResponse({ ok: true, comments });
  } catch (err) {
    return jsonResponse({ ok: false, error: "Failed to load comments" }, 500);
  }
}

async function enforcePostRateLimit(db, request, authorToken, admin, now) {
  if (admin) return true;
  const ipKey = await getIpRateKey(request);
  return checkAndTouchRateLimit(db, [authorToken ? `tok:${authorToken}` : "", ipKey], now);
}

export async function onRequestPost(context) {
  const { env, request } = context;
  if (!env || !env.DB) {
    return jsonResponse({ ok: false, code: "DB_NOT_BOUND", error: "D1 DB binding missing" }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
  }

  try {
    await ensureSchema(env.DB);
    const action = String((body && body.action) || "");
    const authorToken = getViewerToken(request, body && body.authorToken);
    const admin = isAdminRequest(request, env);
    if (!authorToken && !admin) {
      return jsonResponse({ ok: false, error: "Invalid author token" }, 400);
    }

    const actorToken = authorToken || "admin";
    const now = Date.now();

    if (action === "createComment") {
      const text = String((body && body.text) || "").trim().slice(0, 1000);
      if (!text) return jsonResponse({ ok: false, error: "Empty comment" }, 400);

      if (!(await enforcePostRateLimit(env.DB, request, authorToken, admin, now))) {
        return jsonResponse({ ok: false, code: "RATE_LIMIT", error: "Too many requests" }, 429);
      }

      const nick = String((body && body.nick) || "").trim().slice(0, 30) || "익명";
      const type = VALID_TYPES.has(body && body.type) ? body.type : "question";
      const rawScope = String((body && body.scope) || "all").trim();
      const scope = VALID_SCOPE_RE.test(rawScope) ? rawScope.slice(0, 60) : "all";
      const id = makeId("cmt");

      await env.DB.prepare(
        "INSERT INTO comments (id, author_token, nick, type, scope, text, likes, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)"
      )
        .bind(id, actorToken, nick, type, scope, text, now)
        .run();

      return jsonResponse({
        ok: true,
        comment: {
          id,
          nick,
          type,
          scope,
          text,
          likes: 0,
          liked: false,
          createdAt: now,
          isMine: true,
          replies: []
        }
      });
    }

    if (action === "createReply") {
      const commentId = String((body && body.commentId) || "").trim();
      const text = String((body && body.text) || "").trim().slice(0, 500);
      if (!commentId || !text) {
        return jsonResponse({ ok: false, error: "Missing commentId or text" }, 400);
      }

      const parent = await env.DB.prepare("SELECT id FROM comments WHERE id = ?")
        .bind(commentId)
        .first();
      if (!parent) {
        return jsonResponse({ ok: false, error: "Comment not found" }, 404);
      }

      if (!(await enforcePostRateLimit(env.DB, request, authorToken, admin, now))) {
        return jsonResponse({ ok: false, code: "RATE_LIMIT", error: "Too many requests" }, 429);
      }

      const nick = String((body && body.nick) || "").trim().slice(0, 30) || "익명";
      const id = makeId("rep");

      await env.DB.prepare(
        "INSERT INTO replies (id, comment_id, author_token, nick, text, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
        .bind(id, commentId, actorToken, nick, text, now)
        .run();

      return jsonResponse({
        ok: true,
        commentId,
        reply: {
          id,
          nick,
          text,
          createdAt: now,
          isMine: true
        }
      });
    }

    if (action === "toggleLike") {
      const commentId = String((body && body.commentId) || "").trim();
      if (!commentId) return jsonResponse({ ok: false, error: "Missing commentId" }, 400);

      const parent = await env.DB.prepare("SELECT id FROM comments WHERE id = ?")
        .bind(commentId)
        .first();
      if (!parent) return jsonResponse({ ok: false, error: "Comment not found" }, 404);

      const existing = await env.DB.prepare(
        "SELECT comment_id FROM comment_likes WHERE comment_id = ? AND author_token = ?"
      )
        .bind(commentId, actorToken)
        .first();

      let liked;
      if (existing) {
        await env.DB.prepare(
          "DELETE FROM comment_likes WHERE comment_id = ? AND author_token = ?"
        )
          .bind(commentId, actorToken)
          .run();
        liked = false;
      } else {
        await env.DB.prepare(
          "INSERT OR IGNORE INTO comment_likes (comment_id, author_token) VALUES (?, ?)"
        )
          .bind(commentId, actorToken)
          .run();
        liked = true;
      }

      const countRow = await env.DB.prepare(
        "SELECT COUNT(*) AS cnt FROM comment_likes WHERE comment_id = ?"
      )
        .bind(commentId)
        .first();
      const likes = Number((countRow && countRow.cnt) || 0);

      await env.DB.prepare("UPDATE comments SET likes = ? WHERE id = ?")
        .bind(likes, commentId)
        .run();

      return jsonResponse({ ok: true, commentId, likes, liked });
    }

    if (action === "deleteComment") {
      const commentId = String((body && body.commentId) || "").trim();
      if (!commentId) return jsonResponse({ ok: false, error: "Missing commentId" }, 400);

      const row = await env.DB.prepare("SELECT author_token FROM comments WHERE id = ?")
        .bind(commentId)
        .first();
      if (!row) return jsonResponse({ ok: false, error: "Comment not found" }, 404);
      if (!admin && row.author_token !== authorToken) {
        return jsonResponse({ ok: false, error: "Forbidden" }, 403);
      }

      await env.DB.batch([
        env.DB.prepare("DELETE FROM replies WHERE comment_id = ?").bind(commentId),
        env.DB.prepare("DELETE FROM comment_likes WHERE comment_id = ?").bind(commentId),
        env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(commentId)
      ]);

      return jsonResponse({ ok: true, commentId });
    }

    if (action === "deleteReply") {
      const commentId = String((body && body.commentId) || "").trim();
      const replyId = String((body && body.replyId) || "").trim();
      if (!commentId || !replyId) {
        return jsonResponse({ ok: false, error: "Missing ids" }, 400);
      }

      const row = await env.DB.prepare(
        "SELECT author_token FROM replies WHERE id = ? AND comment_id = ?"
      )
        .bind(replyId, commentId)
        .first();
      if (!row) return jsonResponse({ ok: false, error: "Reply not found" }, 404);
      if (!admin && row.author_token !== authorToken) {
        return jsonResponse({ ok: false, error: "Forbidden" }, 403);
      }

      await env.DB.prepare("DELETE FROM replies WHERE id = ? AND comment_id = ?")
        .bind(replyId, commentId)
        .run();

      return jsonResponse({ ok: true, commentId, replyId });
    }

    return jsonResponse({ ok: false, error: "Unknown action" }, 400);
  } catch (err) {
    return jsonResponse({ ok: false, error: "Internal server error" }, 500);
  }
}
