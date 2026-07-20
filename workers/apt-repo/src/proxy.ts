interface Env {
  PROXY_TOKEN: string;
}

export async function handleGhaFallback(request: Request, env: Env): Promise<Response> {
  const token = request.headers.get('X-Proxy-Token');
  if (token !== env.PROXY_TOKEN) {
    return new Response('Forbidden', { status: 403 });
  }

  const targetUrl = new URL(request.url).searchParams.get('url');
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
}
