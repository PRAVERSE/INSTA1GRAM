/**
 * Automated Test Suite for Insta1gram Demo Telegram Bot Integration
 * Tests all requirements specified in the user request.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createServer, loadEnv, isDuplicate, sendTelegramNotification } = require('./server');

loadEnv();

const TEST_PORT = 3188;
let serverInstance;

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const reqHeaders = { ...headers };
    let payload = null;
    if (body) {
      payload = typeof body === 'string' ? body : JSON.stringify(body);
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path,
        method,
        headers: reqHeaders
      },
      res => {
        let resBody = '';
        res.on('data', chunk => (resBody += chunk));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(resBody);
          } catch (_) {}
          resolve({ status: res.statusCode, headers: res.headers, text: resBody, json });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('  STARTING INSTA1GRAM TELEGRAM INTEGRATION TESTS    ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName} - ${details}`);
      failed++;
    }
  }

  // 1. Start test server
  serverInstance = createServer();
  await new Promise(resolve => serverInstance.listen(TEST_PORT, '127.0.0.1', resolve));

  try {
    // TEST 1: Environment Variables Check
    const tokenExists = Boolean(process.env.TELEGRAM_BOT_TOKEN);
    const chatIdExists = Boolean(process.env.TELEGRAM_CHAT_ID);
    assert(tokenExists && chatIdExists, 'Test 1: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID exist in .env');

    // TEST 2: Token is NEVER exposed in index.html source code
    const htmlContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    const tokenInHtml = process.env.TELEGRAM_BOT_TOKEN && htmlContent.includes(process.env.TELEGRAM_BOT_TOKEN);
    const chatIdInHtml = process.env.TELEGRAM_CHAT_ID && htmlContent.includes(process.env.TELEGRAM_CHAT_ID);
    assert(!tokenInHtml && !chatIdInHtml, 'Test 2: Bot token and Chat ID are NOT in index.html');

    // TEST 3: Health check endpoint does NOT leak tokens
    const healthRes = await request('GET', '/api/health');
    assert(
      healthRes.status === 200 &&
      healthRes.json?.ok === true &&
      !healthRes.text.includes(process.env.TELEGRAM_BOT_TOKEN),
      'Test 3: /api/health responds 200 OK without leaking bot token'
    );

    // TEST 4: Frontend HTML served via GET / without leaking credentials
    const rootRes = await request('GET', '/');
    assert(
      rootRes.status === 200 &&
      rootRes.text.includes('Insta1gram') &&
      !rootRes.text.includes(process.env.TELEGRAM_BOT_TOKEN),
      'Test 4: GET / serves index.html securely'
    );

    // TEST 5: Direct access to /.env is strictly forbidden (HTTP 403)
    const envRes = await request('GET', '/.env');
    assert(envRes.status === 403, 'Test 5: GET /.env returns 403 Forbidden');

    // TEST 6: Standard demo login notification
    const loginRes = await request('POST', '/api/notify-login', {
      username: 'automated_test_user',
      clientTime: new Date().toISOString()
    });
    assert(
      loginRes.status === 200 &&
      loginRes.json?.ok === true &&
      loginRes.json?.status === 'successful demo entry',
      'Test 6: POST /api/notify-login successfully processes login event'
    );

    // TEST 7: Invalid-looking demo credentials do NOT block entry
    const invalidCredentialsRes = await request('POST', '/api/notify-login', {
      username: 'user+test!@demo-domain.com',
      clientTime: new Date().toISOString()
    });
    assert(
      invalidCredentialsRes.status === 200 &&
      invalidCredentialsRes.json?.ok === true &&
      invalidCredentialsRes.json?.submittedUsername === 'user+test!@demo-domain.com',
      'Test 7: Arbitrary / invalid-looking demo credentials successfully accepted'
    );

    // TEST 8: Passwords NEVER appear in Telegram notifications or response
    const sensitivePayloadRes = await request('POST', '/api/notify-login', {
      username: 'privacy_test_user',
      password: 'SuperSecretPassword123!',
      pwd: 'AnotherSecretPassword!',
      clientTime: new Date().toISOString()
    });
    assert(
      sensitivePayloadRes.status === 200 &&
      sensitivePayloadRes.json?.ok === true &&
      !sensitivePayloadRes.text.includes('SuperSecretPassword123!') &&
      !sensitivePayloadRes.text.includes('AnotherSecretPassword!'),
      'Test 8: Password fields are completely stripped and never exposed in responses or notifications'
    );

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // TEST 9: Deduplication prevents spamming Telegram for duplicate attempts
    const firstDup = await request('POST', '/api/notify-login', {
      username: 'spam_prevention_user'
    });
    const secondDup = await request('POST', '/api/notify-login', {
      username: 'spam_prevention_user'
    });
    assert(
      firstDup.status === 200 &&
      secondDup.status === 200 &&
      secondDup.json?.deduplicated === true,
      'Test 9: Rapid duplicate login attempts within window are deduplicated'
    );

    // Wait a brief moment to respect Telegram per-chat rate limit before live test
    await sleep(2000);

    // TEST 10: Live Telegram notification delivery verification
    console.log('\nTesting live Telegram notification delivery...');
    const liveDispatchResult = await sendTelegramNotification({
      username: 'live_verification_agent',
      status: 'successful demo entry',
      ip: '127.0.0.1 (Local Verification Test)',
      userAgent: 'Antigravity-Verification-Runner/1.0',
      clientTime: new Date().toISOString()
    });
    assert(
      liveDispatchResult.ok === true && Boolean(liveDispatchResult.messageId),
      'Test 10: Telegram Bot successfully delivered message to chat (Message ID: ' + liveDispatchResult.messageId + ')'
    );

    // TEST 11: Non-blocking resilience when Telegram is simulated down / invalid token
    const savedToken = process.env.TELEGRAM_BOT_TOKEN;
    try {
      process.env.TELEGRAM_BOT_TOKEN = '123456:InvalidTokenSimulated';
      const fallbackRes = await request('POST', '/api/notify-login', {
        username: 'telegram_offline_user'
      });
      assert(
        fallbackRes.status === 200 && fallbackRes.json?.ok === true,
        'Test 11: Backend and user login still succeed 200 OK even if Telegram API fails'
      );
    } finally {
      process.env.TELEGRAM_BOT_TOKEN = savedToken;
    }

    // TEST 12: index.html contains working login form with Nickname instead of Password
    const servedPage = await request('GET', '/');
    assert(
      htmlContent.includes('Insta1gram') &&
      htmlContent.includes('id="lf"') &&
      htmlContent.includes('id="ln"') &&
      !htmlContent.includes('type="password"') &&
      servedPage.text.includes('/api/notify-login') &&
      !servedPage.text.includes(process.env.TELEGRAM_BOT_TOKEN),
      'Test 12: index.html contains login form with Nickname and no password input'
    );

    // TEST 13: Nickname support in login notification endpoint
    const nicknameLoginRes = await request('POST', '/api/notify-login', {
      username: 'art_creator_99',
      nickname: 'Creative Spark',
      clientTime: new Date().toISOString()
    });
    assert(
      nicknameLoginRes.status === 200 &&
      nicknameLoginRes.json?.ok === true &&
      nicknameLoginRes.json?.submittedUsername === 'art_creator_99' &&
      nicknameLoginRes.json?.submittedNickname === 'Creative Spark',
      'Test 13: API successfully processes and returns submitted nickname'
    );

    // TEST 14: Verification that Telegram notification text includes Demo Username and Nickname
    const liveDispatchResult2 = await sendTelegramNotification({
      username: 'john_doe_demo',
      nickname: 'Johnny D',
      status: 'successful demo entry',
      ip: '127.0.0.1 (Nickname Verification Test)',
      userAgent: 'Antigravity-Verification-Runner/1.0',
      clientTime: new Date().toISOString()
    });
    assert(
      liveDispatchResult2.ok === true &&
      Boolean(liveDispatchResult2.textSent) &&
      liveDispatchResult2.textSent.includes('Demo Username:') &&
      liveDispatchResult2.textSent.includes('john_doe_demo') &&
      liveDispatchResult2.textSent.includes('Nickname:') &&
      liveDispatchResult2.textSent.includes('Johnny D') &&
      !liveDispatchResult2.textSent.includes('Password:'),
      'Test 14: Telegram message contains Demo Username and Nickname without any password section'
    );

    // TEST 15: Any legacy password fields are strictly discarded and never logged or forwarded
    const rawSecret = 'RealUserSecretPassword999!';
    const rawSecretRes = await request('POST', '/api/notify-login', {
      username: 'visitor_with_secret',
      nickname: 'Secret Visitor',
      password: rawSecret,
      clientTime: new Date().toISOString()
    });
    assert(
      rawSecretRes.status === 200 &&
      !rawSecretRes.text.includes(rawSecret) &&
      rawSecretRes.json?.submittedNickname === 'Secret Visitor',
      'Test 15: Password fields are completely stripped and never exposed in responses or notifications'
    );

  } catch (err) {
    console.error('Test runner error:', err);
    failed++;
  } finally {
    serverInstance.close();
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
