interface Env {
  REPO: string;
  PAGES_ORIGIN: string;
  CACHE_BUST: string;
  SITE_NAME?: string;
  AUTHOR?: string;
  TELEGRAM?: string;
}

interface Package {
  name: string;
  description: string;
  source: string;
}

function repoOrigin(repo: string): string {
  return `https://raw.githubusercontent.com/${repo}/apt`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function asciiLine(pipePos: number, author: string, rightPad: number): string {
  const beforeBy = Math.max(0, pipePos - 4 - author.length);
  return `#${' '.repeat(beforeBy)}by ${author}|_|${' '.repeat(rightPad)}#`;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const ua = (request.headers.get('User-Agent') || '').toLowerCase();
    const isBrowser = /mozilla|chrome|safari|firefox|edge/.test(ua);

    if (path === '/' || path === '') {
      return isBrowser ? servePage(url, ctx, env) : serveText(url, env);
    }

    if (path === '/apt-key.asc') {
      return proxy(`${env.PAGES_ORIGIN}/apt-repo/apt-key.asc`);
    }

    if (path.startsWith('/dists/')) {
      return proxy(`${env.PAGES_ORIGIN}/apt-repo${path}`);
    }

    if (path.startsWith('/pool/')) {
      return redirectPool(path, ctx, env);
    }

    return isBrowser ? servePage(url, ctx, env) : new Response('Not found', { status: 404 });
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
  const headers = { 'cache-control': 'public, max-age=0, must-revalidate' };
  if (cached) return cached.json();

  const resp = await fetch(url);
  if (!resp.ok) return null;
  const data = await resp.json();
  ctx.waitUntil(cache.put(req, new Response(JSON.stringify(data), { headers })));
  return data;
}

async function redirectPool(path: string, ctx: ExecutionContext, env: Env): Promise<Response> {
  const filename = path.split('/').pop()!;
  const poolMapUrl = `${repoOrigin(env.REPO)}/pool-map.json`;
  const map = await fetchJSON(poolMapUrl, 'https://_cache/pool-map-' + env.CACHE_BUST, ctx) as Record<string, string> | null;
  if (!map || !map[filename]) return new Response('Not found', { status: 404 });
  return Response.redirect(
    `https://github.com/${env.REPO}/releases/download/${map[filename]}/${filename}`,
    302,
  );
}

function serveText(url: URL, env: Env): Response {
  const origin = url.origin;
  const author = env.AUTHOR || '';
  const text = [
    '######################################################################',
    '#                 _   ___ _____   ___                                #',
    '#                /_\\ | _ \\_   _| | _ \\___ _ __  ___                  #',
    '#               / _ \\|  _/ | |   |   / -_) \'_ \\/ _ \\                 #',
    '#              /_/ \\_\\_|   |_|   |_|_\\___| .__/\\___/                 #',
    asciiLine(41, author, 25),
    '#                                                                    #',
    '#               Personal APT repository for software                 #',
    '#                    unavailable or outdated in                      #',
    '#                   standard Ubuntu/Debian repos                     #',
    '#                                                                    #',
    '######################################################################',
    '# Just add the repository to your APT sources:                       #',
    '',
    `sudo curl -fsSL ${origin}/apt-key.asc \\`,
    '  -o /etc/apt/keyrings/daydve-apt-repo.asc && \\',
    'echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/daydve-apt-repo.asc] \\',
    `  ${origin} noble main" \\`,
    '  | sudo tee /etc/apt/sources.list.d/daydve-apt-repo.list && \\',
    'sudo apt update',
    '',
  ].join('\n');
  return new Response(text, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

async function servePage(url: URL, ctx: ExecutionContext, env: Env): Promise<Response> {
  const packagesUrl = `${repoOrigin(env.REPO)}/packages.json`;
  const pkgs = await fetchJSON(packagesUrl, 'https://_cache/packages-' + env.CACHE_BUST, ctx) as Package[] | null;

  let rows = '';
  if (pkgs) {
    rows = pkgs.map(p => {
      const safeName = escapeHtml(p.name);
      const safeDesc = escapeHtml(p.description);
      const name = p.source
        ? `<a href="${escapeHtml(p.source)}" target="_blank" rel="noopener">${safeName}</a>`
        : safeName;
      return `<tr><td>${name}</td><td>${safeDesc}</td></tr>`;
    }).join('\n');
  } else {
    rows = '<tr><td colspan="2">Failed to load package list</td></tr>';
  }

  const pkgNames = pkgs ? pkgs.map(p => escapeHtml(p.name)).join(', ') : 'ayugram, bees, grub-btrfs, keyd, rclone, rdm, wps-office';
  const safeOrigin = escapeHtml(url.origin);
  const siteName = env.SITE_NAME || '';
  const author = env.AUTHOR || '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${siteName} — ${pkgNames}</title>
<meta name="description" content="${siteName} for Ubuntu with packages unavailable in standard repos: ${pkgNames}. Install via ${url.origin}.">
<meta name="keywords" content="APT, repository, Ubuntu, noble, ${pkgNames}">
<meta property="og:title" content="${siteName}">
<meta property="og:description" content="${siteName} for Ubuntu with: ${pkgNames}">
<meta property="og:type" content="website">
<meta property="og:url" content="${safeOrigin}">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github-dark.min.css" crossorigin="anonymous">
<style>
*{box-sizing:border-box}
body{font-family:'Courier New',Courier,monospace;max-width:1000px;margin:0 auto;padding:2rem;line-height:1.6;color:#e6edf3;background:#0d1117}
a{color:#58a6ff}
pre{background:#161b22;padding:1rem;overflow-x:auto;font-size:.85rem;margin:0;border:0!important}
pre code{background:transparent!important;padding:0!important}
table{border-collapse:collapse;width:100%}
th,td{text-align:left;padding:.5rem;border-bottom:1px solid #333}
td a{text-decoration:none;color:#58a6ff}
td a:hover{text-decoration:underline}
.code-wrap{position:relative}
.copy-btn{position:absolute;top:4px;right:4px;background:none;border:none;cursor:pointer;color:#555;padding:4px;line-height:0}
.copy-btn:hover{color:#8b949e}
.copy-btn.copied svg{stroke:#3fb950}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0}
.center{text-align:center}
.ascii-wide{display:block}
.ascii-narrow{display:none}
@media(max-width:768px){.ascii-wide{display:none}.ascii-narrow{display:block}}
</style>
</head>
<body>
<h1 class="sr-only">${siteName} — ${pkgNames}</h1>
<div class="center ascii-wide"><div style="white-space:pre;line-height:1.2">
###############################################################################
#                     _   ___ _____   ___                                     #
#                    /_\\ | _ \\_   _| | _ \\___ _ __  ___                       #
#                   / _ \\|  _/ | |   |   / -_) \'_ \\/ _ \\                      #
#                  /_/ \\_\\_|   |_|   |_|_\\___| .__/\\___/                      #
${asciiLine(45, author, 30)}
#                                                                             #
#                   Personal APT repository for software                      #
#                        unavailable or outdated in                           #
#                       standard Ubuntu/Debian repos                          #
#                                                                             #
###############################################################################
</div></div>
<div class="center ascii-narrow"><div style="white-space:pre;line-height:1.2">
##########################################
#    _   ___ _____   ___                 #
#   /_\\ | _ \\_   _| | _ \\___ _ __  ___   #
#  / _ \\|  _/ | |   |   / -_) \'_ \\/ _ \\  #
# /_/ \\_\\_|   |_|   |_|_\\___| .__/\\___/  #
${asciiLine(28, author, 10)}
#                                        #
#  Personal APT repository for software  #
#       unavailable or outdated in       #
#      standard Ubuntu/Debian repos      #
#                                        #
##########################################
</div></div>

<h2>How to add repo</h2>
<div class="code-wrap">
<pre><code class="language-bash">sudo curl -fsSL ${url.origin}/apt-key.asc \\
  -o /etc/apt/keyrings/daydve-apt-repo.asc && \\
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/daydve-apt-repo.asc] \\
  ${url.origin} noble main" \\
  | sudo tee /etc/apt/sources.list.d/daydve-apt-repo.list && \\
sudo apt update</code></pre>
<button class="copy-btn" onclick="copy(this)" aria-label="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
</div>

<h2>Or just run this</h2>
<div class="code-wrap">
<pre><code class="language-bash">curl -sL ${url.origin} | bash</code></pre>
<button class="copy-btn" onclick="copy(this)" aria-label="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
</div>

<h2>Available packages</h2>
<table>
<tr><th>Package</th><th>Description</th></tr>
${rows}
</table>

<p class="center"><a href="https://github.com/${env.REPO}"><img src="https://img.shields.io/badge/GitHub-${encodeURIComponent(env.REPO).replace(/-/g, '--')}-181717?logo=github" alt="GitHub Repository"></a>${env.TELEGRAM ? ` <a href="${env.TELEGRAM}"><img src="https://img.shields.io/badge/channel-${encodeURIComponent(env.TELEGRAM.replace(/.*\//, '@')).replace(/-/g, '--')}-26A5E4?logo=telegram" alt="Telegram"></a>` : ''}</p>
<p class="center" style="color:#8b949e;font-size:.85rem">Built for personal use</p>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "name": "${siteName}",
  "description": "${siteName} for Ubuntu Noble with: ${pkgNames}",
  "url": "${safeOrigin}",
  "about": {
    "@type": "SoftwareSourceCode",
    "programmingLanguage": "deb",
    "operatingSystem": "Linux",
    "softwareVersion": "noble"
  }
}
</script>

<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js" crossorigin="anonymous"></script>
<script>hljs.highlightAll();
function copy(b){let c=b.parentElement.querySelector('code');navigator.clipboard.writeText(c.textContent).then(()=>{b.classList.add('copied');setTimeout(()=>{b.classList.remove('copied')},2000)}).catch(()=>{})}</script>
</body>
</html>`;
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
