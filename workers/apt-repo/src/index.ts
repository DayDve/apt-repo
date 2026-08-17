interface Env {
  REPO: string;
  PAGES_ORIGIN: string;
  CACHE_BUST: string;
  SITE_NAME?: string;
  AUTHOR?: string;
  TELEGRAM?: string;
  APT_ORIGIN?: string;
}

interface Package {
  name: string;
  description: string;
  source: string;
  group?: string;
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
      return isBrowser ? servePage(url, ctx, env) : serveText(url, ctx, env);
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
      'cache-control': 'public, max-age=0, must-revalidate',
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

interface DisplayEntry {
  kind: 'family' | 'pkg';
  name: string;
  head?: Package;
  members?: Package[];
  pkg?: Package;
}

// Related packages (declared via GROUP= in their package file) are collapsed
// into one "family" row. A group with a single member is shown standalone.
function displayEntries(pkgs: Package[]): DisplayEntry[] {
  const groups = new Map<string, Package[]>();
  const standalone: Package[] = [];
  for (const p of pkgs) {
    if (p.group) {
      const arr = groups.get(p.group) || [];
      arr.push(p);
      groups.set(p.group, arr);
    } else {
      standalone.push(p);
    }
  }
  const entries: DisplayEntry[] = [];
  for (const [g, members] of groups.entries()) {
    members.sort((a, b) => a.name.localeCompare(b.name));
    if (members.length < 2) {
      standalone.push(members[0]);
      continue;
    }
    const head = members.find(m => m.name === g) || members[0];
    entries.push({ kind: 'family', name: g, head, members });
  }
  for (const p of standalone) entries.push({ kind: 'pkg', name: p.name, pkg: p });
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'family' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

function pkgLine(e: DisplayEntry): string {
  if (e.kind === 'pkg' && e.pkg) {
    return `#  ${e.pkg.name} - ${e.pkg.description}`;
  }
  if (e.head && e.members) {
    const names = e.members.map(m => m.name).join(', ');
    return `#  ${e.name} - ${e.head.description} (packages: ${names})`;
  }
  return '';
}

async function serveText(url: URL, ctx: ExecutionContext, env: Env): Promise<Response> {
  const aptOrigin = env.APT_ORIGIN || url.origin;
  const author = env.AUTHOR || '';
  const packagesUrl = `${repoOrigin(env.REPO)}/packages.json`;
  const pkgs = await fetchJSON(packagesUrl, 'https://_cache/packages-' + env.CACHE_BUST, ctx) as Package[] | null;

  let pkgLines: string[];
  if (pkgs && pkgs.length > 0) {
    const entries = displayEntries(pkgs);
    const shown = entries.slice(0, 10);
    pkgLines = shown.map(pkgLine);
    if (entries.length > 10) {
      pkgLines.push('#', `# And ${entries.length - 10} more ...`);
    }
  } else {
    pkgLines = ['# (failed to load package list)'];
  }
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
    '#',
    '# Apps already in this repo:',
    '#',
    ...pkgLines,
    '#',
    '# If you want to use this repo, just add it to your APT sources:',
    '#',
    `sudo curl -fsSL ${aptOrigin}/apt-key.asc \\`,
    '  -o /etc/apt/keyrings/daydve-apt-repo.asc && \\',
    'echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/daydve-apt-repo.asc] \\',
    `  ${aptOrigin} noble main" \\`,
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
    const entries = displayEntries(pkgs);
    const rowFor = (p: Package): string => {
      const safeName = escapeHtml(p.name);
      const safeDesc = escapeHtml(p.description);
      const name = p.source
        ? `<a href="${escapeHtml(p.source)}" target="_blank" rel="noopener">${safeName}</a>`
        : safeName;
      return `<tr><td>${name}</td><td>${safeDesc}</td></tr>`;
    };

    for (const e of entries) {
      if (e.kind === 'pkg' && e.pkg) {
        rows += rowFor(e.pkg) + '\n';
      } else if (e.head && e.members) {
        const n = e.members.length;
        const meta = ` · ${n} ${n === 1 ? 'package' : 'packages'}`;
        rows += `<tbody class="family-head">\n`;
        rows += `<tr class="family-row"><td><button class="family-toggle" onclick="toggleFamily(this)" aria-expanded="false" aria-label="Toggle packages">▸</button> <a href="${escapeHtml(e.head.source)}" target="_blank" rel="noopener">${escapeHtml(e.name)}</a></td><td>${escapeHtml(e.head.description)}<span class="family-meta">${meta}</span></td></tr>\n`;
        rows += `</tbody>\n<tbody class="family-members" hidden>\n`;
        for (const m of e.members) rows += rowFor(m) + '\n';
        rows += `</tbody>\n`;
      }
    }
  } else {
    rows = '<tr><td colspan="2">Failed to load package list</td></tr>';
  }

  const pkgNames = pkgs ? pkgs.map(p => escapeHtml(p.name)).join(', ') : 'ayugram, bees, grub-btrfs, keyd, rclone, rdm, wps-office';
  const safeOrigin = escapeHtml(url.origin);
  const aptOrigin = env.APT_ORIGIN || url.origin;
  const safeAptOrigin = escapeHtml(aptOrigin);
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
.table-scroll{max-height:410px;overflow-y:auto}
.table-scroll thead{position:sticky;top:0;background:#0d1117}
.table-scroll::-webkit-scrollbar{width:6px}
.table-scroll::-webkit-scrollbar-thumb{background:#333;border-radius:3px}
td a{text-decoration:none;color:#58a6ff}
td a:hover{text-decoration:underline}
tbody.family-head td{background:#161b22}
.family-toggle{cursor:pointer;background:none;border:none;color:#8b949e;font-size:.8rem;padding:0 .25rem 0 0;line-height:1}
.family-row td{font-weight:bold}
.family-meta{color:#8b949e;font-weight:normal;font-size:.8rem}
.family-members[hidden]{display:none}
.family-members td{padding-left:2rem}
.family-members td:first-child a{color:#8b949e}
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
<pre><code class="language-bash">sudo curl -fsSL ${safeAptOrigin}/apt-key.asc \\
  -o /etc/apt/keyrings/daydve-apt-repo.asc && \\
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/daydve-apt-repo.asc] \\
  ${safeAptOrigin} noble main" \\
  | sudo tee /etc/apt/sources.list.d/daydve-apt-repo.list && \\
sudo apt update</code></pre>
<button class="copy-btn" onclick="copy(this)" aria-label="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
</div>

<h2>Or just run this</h2>
<div class="code-wrap">
<pre><code class="language-bash">curl -sL ${safeAptOrigin} | bash</code></pre>
<button class="copy-btn" onclick="copy(this)" aria-label="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
</div>

<h2>Available packages</h2>
<div class="table-scroll">
<table>
<thead><tr><th>Package</th><th>Description</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</div>

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
function toggleFamily(b){
  var t = b.closest('tbody').nextElementSibling;
  var hidden = t.hidden;
  t.hidden = !hidden;
  b.textContent = hidden ? '▾' : '▸';
  b.setAttribute('aria-expanded', hidden ? 'true' : 'false');
}
function copy(b){let c=b.parentElement.querySelector('code');navigator.clipboard.writeText(c.textContent).then(()=>{b.classList.add('copied');setTimeout(()=>{b.classList.remove('copied')},2000)}).catch(()=>{})}</script>
</body>
</html>`;
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
