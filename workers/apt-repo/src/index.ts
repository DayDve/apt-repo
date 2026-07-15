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
const CACHE_BUST = 'v4';

export default {
  async fetch(request: Request, _env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const ua = (request.headers.get('User-Agent') || '').toLowerCase();
    const isBrowser = /mozilla|chrome|safari|firefox|edge/.test(ua);

    if (path === '/' || path === '') {
      return isBrowser ? servePage(url, ctx) : serveText();
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
  const headers = {'cache-control': 'public, max-age=0, must-revalidate'};
  if (cached) return cached.json();

  const resp = await fetch(url);
  if (!resp.ok) return null;
  const data = await resp.json();
  ctx.waitUntil(cache.put(req, new Response(JSON.stringify(data), {headers})));
  return data;
}

async function redirectPool(path: string, ctx: ExecutionContext): Promise<Response> {
  const filename = path.split('/').pop()!;
  const map = await fetchJSON(POOL_MAP, 'https://_cache/pool-map-' + CACHE_BUST, ctx) as Record<string, string> | null;
  if (!map || !map[filename]) return new Response('Not found', { status: 404 });
  return Response.redirect(
    `https://github.com/${REPO}/releases/download/${map[filename]}/${filename}`,
    302,
  );
}

function serveText(): Response {
  const text = [
    '###############################################################################',
    '#                     _   ___ _____   ___                                     #',
    '#                    /_\\ | _ \\_   _| | _ \\___ _ __  ___                       #',
    '#                   / _ \\|  _/ | |   |   / -_) \'_ \\/ _ \\                      #',
    '#                  /_/ \\_\\_|   |_|   |_|_\\___| .__/\\___/                      #',
    '#                                   by DayDve|_|                              #',
    '#                                                                             #',
    '#                   Personal APT repository for software                      #',
    '#                        unavailable or outdated in                           #',
    '#                       standard Ubuntu/Debian repos                          #',
    '#                                                                             #',
    '###############################################################################',
    '# Just add the repository to your APT sources:                                #',
    '###############################################################################',
    '',
    'sudo curl -fsSL https://apt.smbit.pro/apt-key.asc \\',
    '  -o /etc/apt/keyrings/daydve-apt-repo.asc && \\',
    'echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/daydve-apt-repo.asc] \\',
    '  https://apt.smbit.pro noble main" \\',
    '  | sudo tee /etc/apt/sources.list.d/daydve-apt-repo.list && \\',
    'sudo apt update',
    '',
  ].join('\n');
  return new Response(text, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

async function servePage(url: URL, ctx: ExecutionContext): Promise<Response> {
  const pkgs = await fetchJSON(PACKAGES_JSON, 'https://_cache/packages-' + CACHE_BUST, ctx) as Package[] | null;

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
<meta name="description" content="Personal APT repository for Ubuntu with packages unavailable in standard repos.">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github-dark.min.css" crossorigin="anonymous">
<style>
*{box-sizing:border-box}
body{
  font-family:'Courier New',Courier,monospace;
  max-width:820px;
  margin:0 auto;
  padding:2rem 1.2rem;
  line-height:1.6;
  color:#c9d1d9;
  background:#0d1117;
  font-size:14px;
}
a{color:#58a6ff;text-decoration:none}
a:hover{text-decoration:underline}
pre{margin:0;border-radius:6px;overflow-x:auto}
table{width:100%;border-collapse:collapse;margin-top:.5rem}
th{text-align:left;color:#8b949e;font-weight:400;font-size:12px;text-transform:uppercase;padding:.3rem 0;border-bottom:1px solid #21262d}
td{padding:.5rem 0;border-bottom:1px solid #161b22}
td:first-child{white-space:nowrap;width:220px}
.code-wrap{position:relative;margin-bottom:1rem}
.code-wrap:hover .copy-btn{opacity:1}
.copy-btn{
  position:absolute;top:4px;right:8px;
  background:#21262d;border:1px solid #30363d;
  color:#8b949e;cursor:pointer;
  font-family:'Courier New',monospace;font-size:11px;
  border-radius:4px;padding:2px 8px;opacity:0;transition:opacity .15s
}
.copy-btn:hover{color:#c9d1d9;border-color:#484f58}
.copy-btn.done{color:#3fb950;border-color:#3fb950}
.banner{color:#484f58;white-space:pre;line-height:1.15;margin-bottom:1.5rem;font-size:12px}
h2{color:#e6edf3;font-size:15px;font-weight:400;margin:2rem 0 .5rem}
.footer{text-align:center;color:#484f58;margin-top:2rem;font-size:12px}
</style>
</head>
<body>
<div class="banner">
###############################################################################
#                     _   ___ _____   ___                                     #
#                    /_\\ | _ \\_   _| | _ \\___ _ __  ___                       #
#                   / _ \\|  _/ | |   |   / -_) '_ \\/ _ \\                      #
#                  /_/ \\_\\_|   |_|   |_|_\\___| .__/\\___/                      #
#                                   by DayDve|_|                              #
#                                                                             #
#                   Personal APT repository for software                      #
#                        unavailable or outdated in                           #
#                       standard Ubuntu/Debian repos                          #
###############################################################################
# Just add the repository to your APT sources:                                #
############################################################################### 
</div>

<h2>Setup</h2>
<div class="code-wrap">
<pre><code class="language-bash">sudo curl -fsSL ${url.origin}/apt-key.asc \\
  -o /etc/apt/keyrings/daydve-apt-repo.asc && \\
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/daydve-apt-repo.asc] \\
  ${url.origin} noble main" \\
  | sudo tee /etc/apt/sources.list.d/daydve-apt-repo.list && \\
sudo apt update</code></pre>
<button class="copy-btn" onclick="copy(this)">copy</button>
</div>

<h2>Quick install</h2>
<div class="code-wrap">
<pre><code class="language-bash">curl -sL ${url.origin} | bash</code></pre>
<button class="copy-btn" onclick="copy(this)">copy</button>
</div>

<h2>Packages</h2>
<table>
<tr><th>Name</th><th>Description</th></tr>
${rows}
</table>

<div class="footer">
  <a href="https://github.com/${REPO}"><img src="https://img.shields.io/badge/GitHub-${REPO.replace('/', '%2F')}-181717?logo=github" alt="GitHub"></a>
  <br>Built for personal use.</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js" crossorigin="anonymous"></script>
<script>
hljs.highlightAll();
function copy(btn){
  let t=btn.parentElement.querySelector('pre').textContent;
  navigator.clipboard.writeText(t).then(()=>{
    btn.textContent='done';btn.classList.add('done');
    setTimeout(()=>{btn.textContent='copy';btn.classList.remove('done')},1500);
  }).catch(()=>{});
}
</script>
</body>
</html>`;
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}