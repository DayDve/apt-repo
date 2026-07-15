interface Env {}

const REPO = 'DayDve/apt-repo';
const PAGES = `https://daydve.github.io/apt-repo`;
const POOL_MAP = `https://raw.githubusercontent.com/${REPO}/apt/pool-map.json`;

export default {
  async fetch(request: Request, _env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const ua = (request.headers.get('User-Agent') || '').toLowerCase();
    const isBrowser = /mozilla|chrome|safari|firefox|edge|curl|wget/.test(ua);

    if (path === '/' || path === '') {
      return isBrowser ? servePage(path, url) : proxy(`${PAGES}/dists/noble/Release`);
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

    return isBrowser ? servePage(path, url) : new Response('Not found', { status: 404 });
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

async function redirectPool(path: string, ctx: ExecutionContext): Promise<Response> {
  const filename = path.split('/').pop()!;
  const cacheKey = new Request('https://_cache/pool-map');
  const cache = caches.default;

  let resp = await cache.match(cacheKey);
  let map: Record<string, string>;

  if (resp) {
    map = await resp.json();
  } else {
    const mapResp = await fetch(POOL_MAP);
    if (!mapResp.ok) {
      return new Response('Pool map not available', { status: 502 });
    }
    map = await mapResp.json() as Record<string, string>;
    ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(map))));
  }

  const tag = map[filename];
  if (!tag) {
    return new Response('Not found', { status: 404 });
  }

  return Response.redirect(
    `https://github.com/${REPO}/releases/download/${tag}/${filename}`,
    302,
  );
}

function servePage(_path: string, url: URL): Response {
  const origin = url.origin;
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
</style>
</head>
<body>
<h1>DayDve APT Repository</h1>
<p>Personal APT repository for software unavailable or outdated in standard Ubuntu/Debian repos.</p>

<h2>Install</h2>
<pre>sudo curl -fsSL ${origin}/apt-key.asc -o /etc/apt/keyrings/daydve-apt-repo.asc
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/daydve-apt-repo.asc] ${origin} $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/daydve-apt-repo.list
sudo apt update
sudo apt install &lt;package&gt;</pre>

<h2>Available packages</h2>
<table>
<tr><th>Package</th><th>Description</th></tr>
<tr><td>ayugram</td><td>Telegram client with enhanced features</td></tr>
<tr><td>bees</td><td>btrfs deduplication daemon</td></tr>
<tr><td>grub-btrfs</td><td>GRUB menu entries for btrfs snapshots</td></tr>
<tr><td>keyd</td><td>Key remapping daemon</td></tr>
<tr><td>rclone</td><td>rsync for cloud storage</td></tr>
<tr><td>rdm</td><td>Remote Desktop Manager</td></tr>
<tr><td>wps-office</td><td>WPS Office repack</td></tr>
</table>

<p><a href="https://github.com/${REPO}">GitHub Repository</a></p>
</body>
</html>`;
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
