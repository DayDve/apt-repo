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
  longDescription?: string;
  icon?: string;
  group?: string;
  categories?: string[];
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

    if (path === '/packages' || path === '/packages/') {
      return servePackages(url, ctx, env);
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

    if (path.startsWith('/icons/')) {
      return proxy(`${repoOrigin(env.REPO)}${path}`, 'image/png');
    }

    return isBrowser ? servePage(url, ctx, env) : new Response('Not found', { status: 404 });
  },
};

async function proxy(url: string, contentType?: string): Promise<Response> {
  const resp = await fetch(url, { cf: { cacheTtl: -1 } });
  return new Response(resp.body, {
    status: resp.status,
    headers: {
      'content-type': contentType || resp.headers.get('content-type') || 'application/octet-stream',
      'content-length': resp.headers.get('content-length') || '',
      'last-modified': resp.headers.get('last-modified') || '',
      'cache-control': 'no-store, no-cache, must-revalidate',
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

  const pkgCount = pkgs ? pkgs.length : 0;
  const pkgNames = pkgs ? pkgs.map(p => escapeHtml(p.name)).join(', ') : '';
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
<title>${siteName}</title>
<meta name="description" content="${siteName} for Ubuntu with packages unavailable in standard repos. Install via ${url.origin}.">
<meta property="og:title" content="${siteName}">
<meta property="og:description" content="${siteName} for Ubuntu — ${pkgCount} packages available">
<meta property="og:type" content="website">
<meta property="og:url" content="${safeOrigin}">
<style>
*{box-sizing:border-box}
body{font-family:'Courier New',Courier,monospace;max-width:1000px;margin:0 auto;padding:2rem;line-height:1.6;color:#e6edf3;background:#0d1117}
a{color:#58a6ff}
pre{background:#161b22;padding:1rem;overflow-x:auto;font-size:.85rem;margin:0;border:0!important}
pre code{background:transparent!important;padding:0!important}
.code-wrap{position:relative}
.copy-btn{position:absolute;top:4px;right:4px;background:none;border:none;cursor:pointer;color:#555;padding:4px;line-height:0}
.copy-btn:hover{color:#8b949e}
.copy-btn.copied svg{stroke:#3fb950}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0}
.center{text-align:center}
.browse-link{display:inline-block;margin:1.5rem 0;padding:.5rem 1.2rem;border:1px solid #30363d;color:#58a6ff;border-radius:4px;font-size:.9rem;text-decoration:none;transition:all .15s}
.browse-link:hover{border-color:#58a6ff;background:#161b22;text-decoration:none}
.ascii-wide{display:block}
.ascii-narrow{display:none}
@media(max-width:768px){.ascii-wide{display:none}.ascii-narrow{display:block}}
</style>
</head>
<body>
<h1 class="sr-only">${siteName}</h1>
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

<div class="center">
<p style="color:#8b949e;font-size:.9rem;margin-top:1rem">${pkgCount} packages available for Ubuntu Noble</p>
<a href="${safeOrigin}/packages" class="browse-link">Browse packages</a>
</div>

<h2>Quick install</h2>
<div class="code-wrap">
<pre><code class="language-bash">sudo curl -fsSL ${safeAptOrigin}/apt-key.asc \\
  -o /etc/apt/keyrings/daydve-apt-repo.asc && \\
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/daydve-apt-repo.asc] \\
  ${safeAptOrigin} noble main" \\
  | sudo tee /etc/apt/sources.list.d/daydve-apt-repo.list && \\
sudo apt update</code></pre>
<button class="copy-btn" onclick="copy(this)" aria-label="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
</div>

<p class="center" style="color:#8b949e;font-size:.85rem;margin-top:2rem"><a href="https://github.com/${env.REPO}">GitHub</a>${env.TELEGRAM ? ` · <a href="${env.TELEGRAM}">Telegram</a>` : ''} · Built for personal use</p>

<script>
function copy(b){let c=b.parentElement.querySelector('code');navigator.clipboard.writeText(c.textContent).then(()=>{b.classList.add('copied');setTimeout(()=>{b.classList.remove('copied')},2000)}).catch(()=>{})}
</script>
</body>
</html>`;
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

const CAT_LABELS: Record<string, string> = {
  System: 'System',
  Network: 'Network',
  InstantMessaging: 'Messaging',
  Office: 'Office',
  Fonts: 'Fonts',
  Utility: 'Utility',
  FileTransfer: 'File Transfer',
  RemoteAccess: 'Remote Access',
  FileTools: 'File Tools',
  Boot: 'Boot',
  Hardware: 'Hardware',
  Emulator: 'Emulator',
  Development: 'Development',
  Filesystem: 'Filesystem',
  Security: 'Security',
};

function catLabel(cat: string): string {
  return CAT_LABELS[cat] || cat;
}

function pkgCard(p: Package, aptOrigin: string, groupCats: string[]): string {
  const safeName = escapeHtml(p.name);
  const safeDesc = escapeHtml(p.description);
  const safeSource = escapeHtml(p.source || '');
  const effectiveCats = p.group ? [...new Set([...(p.categories || []), ...groupCats])] : (p.categories || []);
  const cats = effectiveCats.map(c =>
    `<span class="tag" data-cat="${escapeHtml(c)}">${escapeHtml(catLabel(c))}</span>`
  ).join('');

  const installCmd = `sudo apt install ${p.name}`;
  const familyNote = p.group ? `<span class="family-note">Part of <strong>${escapeHtml(p.group)}</strong></span>` : '';
  const iconUrl = p.icon ? `${escapeHtml(aptOrigin)}${escapeHtml(p.icon)}` : '';
  const iconHtml = iconUrl ? `<img class="card-icon" src="${iconUrl}" alt="${safeName}" width="48" height="48" loading="lazy">` : '';
  const longDesc = p.longDescription ? escapeHtml(p.longDescription) : '';

  return `<div class="card" id="card-${safeName}" data-cats="${escapeHtml(effectiveCats.join(','))}" data-name="${safeName}" data-family="${escapeHtml(p.group || '')}">
<div class="card-header">
  ${iconHtml}
  <h3 class="card-title">${safeSource ? `<a href="${safeSource}" target="_blank" rel="noopener">${safeName}</a>` : safeName}</h3>
</div>
${familyNote}
<p class="card-desc">${longDesc || safeDesc}</p>
<div class="card-tags">${cats}</div>
<div class="card-install">
  <div class="code-wrap">
    <pre><code>${escapeHtml(installCmd)}</code></pre>
    <button class="copy-btn" onclick="copyCmd(this,'${escapeHtml(installCmd)}')" aria-label="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
  </div>
</div>
</div>`;
}

async function servePackages(url: URL, ctx: ExecutionContext, env: Env): Promise<Response> {
  const packagesUrl = `${repoOrigin(env.REPO)}/packages.json`;
  const pkgs = await fetchJSON(packagesUrl, 'https://_cache/packages-' + env.CACHE_BUST, ctx) as Package[] | null;

  const aptOrigin = env.APT_ORIGIN || url.origin;
  const siteName = env.SITE_NAME || '';
  const author = env.AUTHOR || '';
  const safeOrigin = escapeHtml(url.origin);
  const safeAptOrigin = escapeHtml(aptOrigin);
  const pkgCount = pkgs ? pkgs.length : 0;

  const allCats = new Set<string>();
  for (const p of pkgs || []) {
    for (const c of p.categories || []) allCats.add(c);
  }
  const sortedCats = [...allCats].sort();

  const catButtons = sortedCats.map(c =>
    `<button class="filter-btn" data-cat="${escapeHtml(c)}" onclick="filterCat('${escapeHtml(c)}')">${escapeHtml(catLabel(c))}</button>`
  ).join('');

  let cards = '';

  const groupCats = new Map<string, string[]>();
  for (const p of pkgs || []) {
    if (p.group && !groupCats.has(p.group) && (p.categories || []).length > 0) {
      groupCats.set(p.group, p.categories || []);
    }
  }

  for (const p of pkgs || []) {
    const gCats = p.group ? (groupCats.get(p.group) || []) : [];
    cards += pkgCard(p, aptOrigin, gCats) + '\n';
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${siteName} — Packages</title>
<meta name="description" content="Browse and install packages from ${siteName}. APT repository for Ubuntu with software unavailable in standard repos.">
<meta property="og:title" content="${siteName} — Packages">
<meta property="og:description" content="Browse and install packages from ${siteName}">
<meta property="og:type" content="website">
<meta property="og:url" content="${safeOrigin}/packages">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Courier New',Courier,monospace;max-width:1100px;margin:0 auto;padding:1.5rem;line-height:1.6;color:#e6edf3;background:#0d1117}
a{color:#58a6ff;text-decoration:none}
a:hover{text-decoration:underline}

.header{text-align:center;padding:1.5rem 0}
.header h1{font-size:1.5rem;margin-bottom:.5rem}
.header p{color:#8b949e;font-size:.9rem}
.header .nav{margin-top:.75rem;font-size:.85rem}
.header .nav a{color:#8b949e;margin:0 .5rem}
.header .nav a:hover{color:#58a6ff}

.toolbar{display:flex;flex-wrap:wrap;gap:.75rem;align-items:center;margin:1.5rem 0}
.search{flex:1;min-width:200px;padding:.6rem .8rem;background:#161b22;border:1px solid #30363d;border-radius:6px;color:#e6edf3;font-family:inherit;font-size:.85rem;outline:none}
.search:focus{border-color:#58a6ff}
.search::placeholder{color:#484f58}

.filters{display:flex;flex-wrap:wrap;gap:.4rem}
.filter-btn{padding:.3rem .6rem;background:#161b22;border:1px solid #30363d;border-radius:20px;color:#8b949e;font-family:inherit;font-size:.75rem;cursor:pointer;transition:all .15s}
.filter-btn:hover{border-color:#58a6ff;color:#58a6ff}
.filter-btn.active{background:#1f6feb;border-color:#1f6feb;color:#fff}

.count{color:#8b949e;font-size:.8rem;margin-left:auto;white-space:nowrap}

.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1rem;margin-top:1rem}
.card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1.2rem;display:flex;flex-direction:column;transition:border-color .15s}
.card:hover{border-color:#58a6ff}
.card.hidden{display:none}
.card-header{display:flex;align-items:center;gap:.6rem;margin-bottom:.4rem}
.card-icon{width:48px;height:48px;border-radius:8px;flex-shrink:0}
.card-title{font-size:1rem;font-weight:bold}
.card-title a{color:#58a6ff}
.family-note{font-size:.75rem;color:#8b949e;margin-bottom:.3rem}
.family-note strong{color:#58a6ff}
.card-desc{color:#c9d1d9;font-size:.85rem;margin-bottom:.6rem;flex:1}
.card-tags{display:flex;flex-wrap:wrap;gap:.3rem;margin-bottom:.8rem}
.tag{font-size:.7rem;padding:.15rem .5rem;background:#30363d;border-radius:12px;color:#8b949e}
.card-install{margin-top:auto}
.code-wrap{position:relative}
.code-wrap pre{background:#0d1117;padding:.5rem .7rem;border-radius:4px;font-size:.8rem;overflow-x:auto;border:1px solid #21262d}
.code-wrap code{color:#7ee787}
.copy-btn{position:absolute;top:4px;right:4px;background:none;border:none;cursor:pointer;color:#484f58;padding:4px;line-height:0}
.copy-btn:hover{color:#8b949e}
.copy-btn.copied svg{stroke:#3fb950}
.empty{text-align:center;padding:3rem;color:#484f58;font-size:.9rem}

.footer{text-align:center;padding:2rem 0 1rem;color:#484f58;font-size:.8rem}
.footer a{color:#8b949e}
</style>
</head>
<body>

<div class="header">
  <h1>${siteName || 'Packages'}</h1>
  <p>${pkgCount} packages available for Ubuntu Noble</p>
  <div class="nav">
    <a href="${safeOrigin}">Home</a>
    <a href="${safeOrigin}/packages">Packages</a>
    <a href="https://github.com/${escapeHtml(env.REPO)}">GitHub</a>
  </div>
</div>

<div class="toolbar">
  <input type="text" class="search" placeholder="Search packages..." oninput="filterAll()" id="search">
  <div class="filters">
    <button class="filter-btn active" data-cat="all" onclick="filterCat('all')">All</button>
    ${catButtons}
  </div>
  <span class="count" id="count">${pkgCount} packages</span>
</div>

<div class="grid" id="grid">
${cards}
</div>

<div class="empty" id="empty" style="display:none">No packages match your search.</div>

<div class="footer">
  <p><a href="https://github.com/${escapeHtml(env.REPO)}">GitHub</a>${env.TELEGRAM ? ` · <a href="${escapeHtml(env.TELEGRAM)}">Telegram</a>` : ''}</p>
  <p>Built for personal use</p>
</div>

<script>
let activeCat = 'all';

function filterCat(cat) {
  activeCat = cat;
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.cat === cat);
  });
  filterAll();
}

function filterAll() {
  const q = document.getElementById('search').value.toLowerCase();
  const cards = document.querySelectorAll('.card');
  let visible = 0;
  cards.forEach(c => {
    const name = c.dataset.name || '';
    const cats = (c.dataset.cats || '').split(',');
    const text = c.textContent.toLowerCase();
    const matchSearch = !q || text.includes(q);
    const matchCat = activeCat === 'all' || cats.includes(activeCat);
    const show = matchSearch && matchCat;
    c.classList.toggle('hidden', !show);
    if (show) visible++;
  });
  document.getElementById('count').textContent = visible + ' package' + (visible !== 1 ? 's' : '');
  document.getElementById('empty').style.display = visible === 0 ? 'block' : 'none';
}

function copyCmd(btn, cmd) {
  navigator.clipboard.writeText(cmd).then(() => {
    btn.classList.add('copied');
    setTimeout(() => btn.classList.remove('copied'), 2000);
  }).catch(() => {});
}
</script>

</body>
</html>`;

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
