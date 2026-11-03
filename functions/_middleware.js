/**
 * Cloudflare Pages Functions Middleware
 * Security guard: Block any attempts to access sensitive files like .env or .git
 */
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const pathname = url.pathname.toLowerCase();

  if (
    pathname.includes('.env') ||
    pathname.includes('.git') ||
    pathname.includes('package.json') ||
    pathname.includes('server.js') ||
    pathname.includes('test.js')
  ) {
    return new Response('Access Forbidden', {
      status: 403,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  }

  // Security headers on all outgoing responses
  const response = await context.next();
  const newHeaders = new Headers(response.headers);
  newHeaders.set('X-Content-Type-Options', 'nosniff');
  newHeaders.set('X-Frame-Options', 'SAMEORIGIN');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}
