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
const CACHE_BUST = 'v3';

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
        ? `<a href="${p.source}" rel="noopener">${p.name}</a>`
        : p.name;
      return `<div class="pkg"><span class="pkg-name">${name}</span> <span class="pkg-desc">${p.description}</span></div>`;
    }).join('\n');
  } else {
    rows = '<div class="pkg">error: could not fetch package list</div>';
  }

  const setupCmd = `sudo curl -fsSL ${url.origin}/apt-key.asc \\
  -o /etc/apt/keyrings/daydve-apt-repo.asc && \\
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/daydve-apt-repo.asc] \\
  ${url.origin} noble main" \\
  | sudo tee /etc/apt/sources.list.d/daydve-apt-repo.list && \\
sudo apt update`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>apt.smbit.pro</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{
  background:#0c0c0c;
  color:#b0b0b0;
  font-family:'Courier New',Courier,monospace;
  font-size:14px;
  line-height:1.6;
  max-width:820px;
  margin:0 auto;
  padding:2rem 1.5rem;
}
a{color:#7c7;text-decoration:none}
a:hover{text-decoration:underline}
.banner{color:#555;white-space:pre;line-height:1.15;margin-bottom:2rem;font-size:13px}
h2{color:#ccc;font-size:16px;font-weight:400;margin:2rem 0 .8rem}
h2::before{content:'$ ';color:#444}
.cmd{background:#141414;padding:1rem;position:relative;margin-bottom:1rem}
.cmd:hover .copy{opacity:1}
.cmd pre{white-space:pre-wrap;word-break:break-all}
.copy{
  position:absolute;top:4px;right:8px;
  background:none;border:1px solid #333;
  color:#555;cursor:pointer;
  font-family:'Courier New',monospace;font-size:11px;
  padding:2px 6px;opacity:0;transition:opacity .15s
}
.copy:hover{color:#aaa;border-color:#555}
.copy.done{color:#7c7;border-color:#7c7}
.pkg{display:flex;padding:.4rem 0;border-bottom:1px solid #1a1a1a}
.pkg-name{flex:0 0 160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pkg-desc{color:#777;flex:1}
.footer{text-align:center;color:#444;margin-top:2.5rem;font-size:12px}
</style>
</head>
<body>
<pre class="banner">###############################################################################
#                     _   ___ _____   ___                                     #
#                    /_\\ | _ \\_   _| | _ \\___ _ __  ___                       #
#                   / _ \\|  _/ | |   |   / -_) '_ \\/ _ \\                      #
#                  /_/ \\_\\_|   |_|   |_|_\\___| .__/\\___/                      #
#                                   by DayDve|_|                              #
#                                                                             #
#                   Personal APT repository for software                      #
#                        unavailable or outdated in                           #
#                       standard Ubuntu/Debian repos                          #
###############################################################################</pre>

<h2>add repo</h2>
<div class="cmd">
<pre>${setupCmd}</pre>
<button class="copy" onclick="copy(this)">copy</button>
</div>

<h2>quick install</h2>
<div class="cmd">
<pre>curl -sL ${url.origin} | bash</pre>
<button class="copy" onclick="copy(this)">copy</button>
</div>

<h2>packages</h2>
${rows}

<div class="footer">[ <a href="https://github.com/${REPO}">github.com/${REPO}</a> ]</div>

<script>
function copy(btn){let t=btn.parentElement.querySelector('pre').textContent;navigator.clipboard.writeText(t).then(()=>{btn.textContent='done';btn.classList.add('done');setTimeout(()=>{btn.textContent='copy';btn.classList.remove('done')},1500)}).catch(()=>{})}
</script>
</body>
</html>`;
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}