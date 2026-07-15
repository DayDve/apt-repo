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
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github.min.css" crossorigin="anonymous">
<style>
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:800px;margin:0 auto;padding:2rem;line-height:1.6;color:#1f2328}
h1{border-bottom:1px solid #d0d7de;padding-bottom:.5rem}
pre{background:#f6f8fa;padding:1rem;border-radius:6px;overflow-x:auto;position:relative;border:1px solid #d0d7de;font-size:.85rem;margin:0}
pre code{background:0 0;padding:0;border-radius:0}
table{border-collapse:collapse;width:100%}
th,td{text-align:left;padding:.5rem;border-bottom:1px solid #d0d7de}
td a{text-decoration:none;color:#0969da}
td a:hover{text-decoration:underline}
.code-header{display:flex;justify-content:flex-end;margin-bottom:0}
.copy-btn{font-size:.75rem;padding:.2rem .6rem;border:1px solid #d0d7de;border-radius:4px;background:#f6f8fa;cursor:pointer;color:#656d76;font-family:inherit}
.copy-btn:hover{background:#eaeef2}
.copy-btn.copied{color:#1a7f37;border-color:#1a7f37}
</style>
</head>
<body>
<h1>DayDve APT Repository</h1>
<p>Personal APT repository for software unavailable or outdated in standard Ubuntu/Debian repos.</p>

<h2>Setup</h2>
<div class="code-header"><button class="copy-btn" onclick="copy(this)">Copy</button></div>
<pre><code class="language-bash">sudo curl -fsSL ${url.origin}/apt-key.asc \
  -o /etc/apt/keyrings/daydve-apt-repo.asc && \
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/daydve-apt-repo.asc] \
  ${url.origin} \$(lsb_release -cs) main" \
  | sudo tee /etc/apt/sources.list.d/daydve-apt-repo.list && \
sudo apt update</code></pre>

<h2>Available packages</h2>
<table>
<tr><th>Package</th><th>Description</th></tr>
${rows}
</table>

<p><a href="https://github.com/${REPO}">GitHub Repository</a></p>

<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js" crossorigin="anonymous"></script>
<script>hljs.highlightAll();
function copy(b){let c=b.parentElement.nextElementSibling;navigator.clipboard.writeText(c.textContent).then(()=>{b.textContent="Copied!";b.classList.add("copied");setTimeout(()=>{b.textContent="Copy";b.classList.remove("copied")},2000)}).catch(()=>{})}</script>
</body>
</html>`;
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
