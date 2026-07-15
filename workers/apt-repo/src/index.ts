interface Env {}

interface Package {
  name: string;
  description: string;
  source: string;
}

const REPO = 'DayDve/apt-repo';
const PAGES = `https://daydve.github.io/apt-repo`;
const POOL_MAP = `https://raw.githubusercontent.com/${REPO}/apt/pool-map.json`;
const PACKAGES_JSON = `https://raw.githubusercontent.com/${REPO}/apt/packages.json`;

export default {
  async fetch(request: Request, _env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const ua = (request.headers.get('User-Agent') || '').toLowerCase();
    const isBrowser = /mozilla|chrome|safari|firefox|edge|curl|wget/.test(ua);

    if (path === '/' || path === '') {
      return isBrowser ? servePage(url, ctx) : proxy(`${PAGES}/dists/noble/Release`);
    }

    if (path === '/apt-key.asc') {
      return proxy(`${PAGES}/apt-key.asc`);
    }

    if (path.startsWith('/dists/')) {
      return proxy(`${PAGES}${path}`);
    }

    if (path.startsWith('/pool/')) {
      return redirectPool(path, ctx);
    }

    return isBrowser ? servePage(url, ctx) : new Response('Not found', { status: 404 });
  },
};

async function proxy(url: string): Promise<Response> {
  const resp = await fetch(url);
  return new Response(resp.body, {
    status: resp.status,
    headers: {
      'content-type': resp.headers.get('content-type') || 'application/octet-stream',
      'content-length': resp.headers.get('content-length') || '',
      'last-modified': resp.headers.get('last-modified') || '',
    },
  });
}

async function fetchJSON(url: string, cacheKey: string, ctx: ExecutionContext): Promise<any> {
  const cache = caches.default;
  const req = new Request(cacheKey);
  const cached = await cache.match(req);
  if (cached) return cached.json();

  const resp = await fetch(url);
  if (!resp.ok) return null;
  const data = await resp.json();
  ctx.waitUntil(cache.put(req, new Response(JSON.stringify(data))));
  return data;
}

async function redirectPool(path: string, ctx: ExecutionContext): Promise<Response> {
  const filename = path.split('/').pop()!;
  const map = await fetchJSON(POOL_MAP, 'https://_cache/pool-map', ctx) as Record<string, string> | null;
  if (!map || !map[filename]) return new Response('Not found', { status: 404 });
  return Response.redirect(
    `https://github.com/${REPO}/releases/download/${map[filename]}/${filename}`,
    302,
  );
}

async function servePage(url: URL, ctx: ExecutionContext): Promise<Response> {
  const pkgs = await fetchJSON(PACKAGES_JSON, 'https://_cache/packages', ctx) as Package[] | null;

  let rows = '';
  if (pkgs) {
    rows = pkgs.map(p => {
      const name = p.source
        ? `<a href="${p.source}" target="_blank" rel="noopener">${p.name}</a>`
        : p.name;
      return `<tr><td>${name}</td><td>${p.description}</td></tr>`;
    }).join('\n');
  } else {
    rows = '<tr><td colspan="2">Failed to load package list</td></tr>';
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DayDve APT Repository</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:800px;margin:0 auto;padding:2rem;line-height:1.6}
h1{border-bottom:1px solid #eee;padding-bottom:.5rem}
code{background:#f5f5f5;padding:.2rem .4rem;border-radius:3px;font-size:.9em}
pre{background:#f5f5f5;padding:1rem;border-radius:5px;overflow-x:auto}
table{border-collapse:collapse;width:100%}
th,td{text-align:left;padding:.5rem;border-bottom:1px solid #eee}
td a{text-decoration:none}
td a:hover{text-decoration:underline}
</style>
</head>
<body>
<h1>DayDve APT Repository</h1>
<p>Personal APT repository for software unavailable or outdated in standard Ubuntu/Debian repos.</p>

<h2>Install</h2>
<pre>sudo curl -fsSL ${url.origin}/apt-key.asc -o /etc/apt/keyrings/daydve-apt-repo.asc
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/daydve-apt-repo.asc] ${url.origin} $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/daydve-apt-repo.list
sudo apt update
sudo apt install &lt;package&gt;</pre>

<h2>Available packages</h2>
<table>
<tr><th>Package</th><th>Description</th></tr>
${rows}
</table>

<p><a href="https://github.com/${REPO}">GitHub Repository</a></p>
</body>
</html>`;
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
