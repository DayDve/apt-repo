interface Env {
  PROXY_TOKEN: string;
}

/** Constant-time string comparison (hash both sides first to normalize length) */
async function tokensEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const ua = new Uint8Array(da);
  const ub = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== '/') {
      return new Response('Not found', { status: 404 });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }

    if (!(await tokensEqual(request.headers.get('X-Proxy-Token') ?? '', env.PROXY_TOKEN))) {
      return new Response('Forbidden', { status: 403 });
    }

    const targetUrl = url.searchParams.get('url');
    if (!targetUrl) {
      return new Response('Missing url param', { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      return new Response('Invalid URL', { status: 400 });
    }

    if (parsed.protocol !== 'https:') {
      return new Response('Only HTTPS allowed', { status: 400 });
    }

    const headers = new Headers(request.headers);
    headers.delete('X-Proxy-Token');

    const resp = await fetch(targetUrl, { method: request.method, headers });
    return new Response(resp.body, {
      status: resp.status,
      headers: {
        'content-type': resp.headers.get('content-type') || 'application/octet-stream',
      },
    });
  },
};
