import { jsonResponse, isDuplicate, sendTelegramNotification } from '../_lib/telegram.js';

export async function onRequestPost(context) {
  try {
    let body = {};
    try {
      body = await context.request.json();
    } catch (_) {
      body = {};
    }

    // Security check: Never store, log, or forward any passwords
    delete body.password;
    delete body.pass;
    delete body.pwd;

    const username = typeof body.username === 'string' && body.username.trim()
      ? body.username.trim()
      : 'demo_user';
    const nickname = typeof body.nickname === 'string' && body.nickname.trim()
      ? body.nickname.trim()
      : (typeof body.nick === 'string' && body.nick.trim() ? body.nick.trim() : '');
    const clientStatus = typeof body.status === 'string' && body.status.trim()
      ? body.status.trim()
      : 'successful demo entry';
    const clientTime = body.clientTime || new Date().toISOString();
    const sessionId = typeof body.sessionId === 'string' && body.sessionId.trim()
      ? body.sessionId.trim()
      : `SESS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const ip = context.request.headers.get('cf-connecting-ip') ||
               context.request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
               '127.0.0.1';
    const userAgent = context.request.headers.get('user-agent') || 'Unknown';

    // Deduplication check
    if (isDuplicate(username, ip)) {
      return jsonResponse({
        ok: true,
        status: 'successful demo entry',
        deduplicated: true,
        sessionId,
        submittedUsername: username,
        submittedNickname: nickname
      });
    }

    // Dispatch Telegram notification asynchronously
    const dispatchPromise = sendTelegramNotification(context.env, {
      username,
      nickname,
      status: clientStatus,
      ip,
      userAgent,
      clientTime,
      sessionId
    }).catch(err => {
      console.error('[Cloudflare Pages Functions] Async dispatch notice:', err.message);
    });

    if (context.waitUntil && typeof context.waitUntil === 'function') {
      context.waitUntil(dispatchPromise);
    } else {
      await dispatchPromise;
    }

    return jsonResponse({
      ok: true,
      status: 'successful demo entry',
      submittedUsername: username,
      submittedNickname: nickname,
      sessionId,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Cloudflare Pages Functions] Login notification error:', err.message);
    return jsonResponse({ ok: false, error: err.message }, 400);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
