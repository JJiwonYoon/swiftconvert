/**
 * Cloudflare Pages Function: /api/requests
 * Delivers developer feature requests immediately via Telegram Bot API
 * and archives them in Cloudflare D1 (binding: DB) when available.
 */

import {
  DEFAULT_RATE_LIMIT_MS,
  enforcePostRateLimit,
  getViewerToken,
  isAdminRequest,
  jsonResponse,
  makeId,
  rateLimitTableSql
} from "../_lib/shared.js";

const MAX_TELEGRAM_HTML_LEN = 3950;

let schemaReadyPromise = null;

function ensureRequestsSchema(db) {
  if (!schemaReadyPromise) {
    schemaReadyPromise = db
      .batch([
        db.prepare(`
          CREATE TABLE IF NOT EXISTS feature_requests (
            id TEXT PRIMARY KEY,
            ticket_id TEXT NOT NULL,
            category TEXT NOT NULL,
            priority TEXT NOT NULL,
            tool TEXT NOT NULL,
            title TEXT NOT NULL,
            details TEXT NOT NULL,
            contact TEXT NOT NULL DEFAULT '',
            env_info TEXT NOT NULL DEFAULT '',
            telegram_sent INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
          )
        `),
        db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_feature_requests_created_at
          ON feature_requests (created_at DESC)
        `),
        rateLimitTableSql(db)
      ])
      .catch((err) => {
        schemaReadyPromise = null;
        throw err;
      });
  }
  return schemaReadyPromise;
}

function getTelegramConfig(env) {
  const token = String((env && env.TELEGRAM_BOT_TOKEN) || "").trim();
  const rawChats = String((env && env.TELEGRAM_CHAT_ID) || "").trim();
  const chatIds = rawChats
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const rawThread = env && env.TELEGRAM_THREAD_ID ? Number(env.TELEGRAM_THREAD_ID) : 0;
  const messageThreadId = Number.isInteger(rawThread) && rawThread > 0 ? rawThread : 0;
  return { token, chatIds, messageThreadId };
}

function escapeTelegramHtml(text) {
  return String(text == null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fitEscapedHtml(rawText, maxEscapedLen) {
  const escaped = escapeTelegramHtml(rawText);
  if (escaped.length <= maxEscapedLen) return escaped;
  if (maxEscapedLen <= 3) return "";
  let end = Math.min(rawText.length, maxEscapedLen - 3);
  while (end > 0 && escapeTelegramHtml(rawText.slice(0, end)).length > maxEscapedLen - 3) {
    end -= 1;
  }
  return `${escapeTelegramHtml(rawText.slice(0, end))}...`;
}

function buildTelegramMessage(ticket) {
  const headerLines = [
    "🌿 <b>LeafConvert 새 개발자 요청서</b>",
    `🆔 <code>#${fitEscapedHtml(ticket.ticketId, 80)}</code>`,
    "",
    `📌 <b>제목:</b> ${fitEscapedHtml(ticket.title, 300)}`,
    `📂 <b>유형:</b> ${fitEscapedHtml(ticket.category, 120)}`,
    `⚡ <b>우선순위:</b> ${fitEscapedHtml(ticket.priority, 100)}`,
    `🛠️ <b>관련 도구:</b> ${fitEscapedHtml(ticket.tool, 160)}`
  ];
  if (ticket.contact) {
    headerLines.push(`👤 <b>연락처:</b> ${fitEscapedHtml(ticket.contact, 240)}`);
  }

  const envLine = ticket.env
    ? `\n\n🖥 <b>환경:</b> <code>${fitEscapedHtml(ticket.env, 500)}</code>`
    : "";
  const detailsHeader = "\n\n📝 <b>상세 설명:</b>\n";
  const prefix = headerLines.join("\n") + detailsHeader;
  const remaining = Math.max(0, MAX_TELEGRAM_HTML_LEN - prefix.length - envLine.length);
  const detailsHtml = fitEscapedHtml(ticket.details, remaining);

  return `${prefix}${detailsHtml}${envLine}`;
}

async function sendTelegramMessage(config, chatId, text) {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true }
  };
  if (config.messageThreadId) {
    payload.message_thread_id = config.messageThreadId;
  }

  const res = await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => null);
  return Boolean(res.ok && data && data.ok === true);
}

/**
 * Expose non-sensitive configuration readiness for health verification.
 */
export async function onRequestGet(context) {
  const { env } = context;
  const { token, chatIds } = getTelegramConfig(env);
  return jsonResponse({
    ok: true,
    telegramConfigured: Boolean(token && chatIds.length > 0),
    dbBound: Boolean(env && env.DB)
  });
}

/**
 * Receive a developer feature request and deliver it via Telegram Bot API.
 */
export async function onRequestPost(context) {
  const { env, request } = context;
  const telegramConfig = getTelegramConfig(env);
  if (!telegramConfig.token || telegramConfig.chatIds.length === 0) {
    return jsonResponse(
      {
        ok: false,
        code: "TELEGRAM_NOT_CONFIGURED",
        error: "Telegram notification secrets are not configured"
      },
      503
    );
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const title = String((body && body.title) || "").trim().slice(0, 120);
  const details = String((body && body.details) || "").trim().slice(0, 2000);
  if (!title || !details) {
    return jsonResponse({ ok: false, error: "Title and details are required" }, 400);
  }

  const ticket = {
    ticketId: String((body && body.ticketId) || "").trim().slice(0, 40) || makeId("REQ"),
    category: String((body && body.category) || "").trim().slice(0, 60) || "기능 제안",
    priority: String((body && body.priority) || "").trim().slice(0, 40) || "보통",
    tool: String((body && body.tool) || "").trim().slice(0, 80) || "전체",
    title,
    details,
    contact: String((body && body.contact) || "").trim().slice(0, 120),
    env: String((body && body.env) || "").trim().slice(0, 400)
  };

  const now = Date.now();
  const db = env && env.DB ? env.DB : null;
  let dbReady = false;

  if (db) {
    try {
      await ensureRequestsSchema(db);
      dbReady = true;
      const authorToken = getViewerToken(request, body && body.authorToken);
      const admin = isAdminRequest(request, env);
      const allowed = await enforcePostRateLimit(db, request, authorToken, admin, now, {
        scopePrefix: "req:",
        rateLimitMs: DEFAULT_RATE_LIMIT_MS
      });
      if (!allowed) {
        return jsonResponse({ ok: false, code: "RATE_LIMIT", error: "Too many requests" }, 429);
      }
    } catch (err) {
      dbReady = false;
    }
  }

  const messageHtml = buildTelegramMessage(ticket);
  let sentCount = 0;
  try {
    const outcomes = await Promise.all(
      telegramConfig.chatIds.map((chatId) =>
        sendTelegramMessage(telegramConfig, chatId, messageHtml).catch(() => false)
      )
    );
    sentCount = outcomes.filter(Boolean).length;
  } catch (err) {
    sentCount = 0;
  }

  if (db && dbReady) {
    try {
      await db
        .prepare(
          "INSERT INTO feature_requests (id, ticket_id, category, priority, tool, title, details, contact, env_info, telegram_sent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(
          makeId("req"),
          ticket.ticketId,
          ticket.category,
          ticket.priority,
          ticket.tool,
          ticket.title,
          ticket.details,
          ticket.contact,
          ticket.env,
          sentCount > 0 ? 1 : 0,
          now
        )
        .run();
    } catch (err) {
      // Best-effort archive; delivery result takes precedence
    }
  }

  if (sentCount === 0) {
    return jsonResponse(
      { ok: false, code: "TELEGRAM_DELIVERY_FAILED", error: "Failed to deliver Telegram message" },
      502
    );
  }

  return jsonResponse({
    ok: true,
    delivered: "telegram",
    ticketId: ticket.ticketId
  });
}
