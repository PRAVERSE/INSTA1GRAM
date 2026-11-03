import { jsonResponse } from '../_lib/telegram.js';

export async function onRequestGet(context) {
  const token = context.env.TELEGRAM_BOT_TOKEN || '';
  const chatId = context.env.TELEGRAM_CHAT_ID || '';

  return jsonResponse({
    ok: true,
    service: 'insta1gram-cloudflare-pages',
    status: 'healthy',
    telegramConfigured: Boolean(token && chatId)
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
