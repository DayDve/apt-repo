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
  screenshots?: string[];
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
      return isBrowser ? serveHome(url, ctx, env) : serveText(url, ctx, env);
    }

    if (path === '/packages' || path === '/packages/') {
      return servePackageList(url, ctx, env);
    }

    const pkgMatch = path.match(/^\/packages\/([^/]+)$/);
    if (pkgMatch) {
      return servePackageDetail(pkgMatch[1], url, ctx, env);
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

    return isBrowser ? serveHome(url, ctx, env) : new Response('Not found', { status: 404 });
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

function sharedStyles(): string {
  return `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Courier New',Courier,monospace;max-width:1000px;margin:0 auto;padding:1.5rem;line-height:1.6;color:#e6edf3;background:#0d1117}
a{color:#58a6ff;text-decoration:none}
a:hover{text-decoration:underline}
pre{background:#161b22;padding:1rem;overflow-x:auto;font-size:.85rem;margin:0;border:0!important}
pre code{background:transparent!important;padding:0!important}
.code-wrap{position:relative}
.copy-btn{position:absolute;top:4px;right:4px;background:none;border:none;cursor:pointer;color:#555;padding:4px;line-height:0}
.copy-btn:hover{color:#8b949e}
.copy-btn.copied svg{stroke:#3fb950}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0}
.center{text-align:center}`;
}

function sharedScript(): string {
  return `
function copyCmd(btn,cmd){navigator.clipboard.writeText(cmd).then(()=>{btn.classList.add('copied');setTimeout(()=>btn.classList.remove('copied'),2000)}).catch(()=>{})}`;
}

// ── Text endpoint (for curl | bash) ──

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

// ── Homepage ──

async function serveHome(url: URL, ctx: ExecutionContext, env: Env): Promise<Response> {
  const packagesUrl = `${repoOrigin(env.REPO)}/packages.json`;
  const pkgs = await fetchJSON(packagesUrl, 'https://_cache/packages-' + env.CACHE_BUST, ctx) as Package[] | null;

  const pkgCount = pkgs ? pkgs.length : 0;
  const safeOrigin = escapeHtml(url.origin);
  const aptOrigin = env.APT_ORIGIN || url.origin;
  const safeAptOrigin = escapeHtml(aptOrigin);
  const siteName = env.SITE_NAME || '';
  const author = env.AUTHOR || '';
  const fallbackOrigin = 'https://apt-repo.daydve.workers.dev';
  const safeFallback = escapeHtml(fallbackOrigin);

  const setupCmd = `sudo curl -fsSL ${safeAptOrigin}/apt-key.asc \\
  -o /etc/apt/keyrings/daydve-apt-repo.asc && \\
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/daydve-apt-repo.asc] \\
  ${safeAptOrigin} noble main" \\
  | sudo tee /etc/apt/sources.list.d/daydve-apt-repo.list && \\
sudo apt update`;

  const setupCmdFallback = `sudo curl -fsSL ${safeFallback}/apt-key.asc \\
  -o /etc/apt/keyrings/daydve-apt-repo.asc && \\
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/daydve-apt-repo.asc] \\
  ${safeFallback} noble main" \\
  | sudo tee /etc/apt/sources.list.d/daydve-apt-repo.list && \\
sudo apt update`;

  const keyCmd = `sudo curl -fsSL ${safeAptOrigin}/apt-key.asc \\
  -o /etc/apt/keyrings/daydve-apt-repo.asc`;

  const sourcesLine = `deb [arch=amd64 signed-by=/etc/apt/keyrings/daydve-apt-repo.asc] ${safeAptOrigin} noble main`;

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
${sharedStyles()}
.tab-group{margin:1.5rem 0}
.tab-headers{display:flex;gap:0;border-bottom:1px solid #30363d;margin-bottom:0}
.tab-header{padding:.5rem 1rem;background:none;border:1px solid #30363d;border-bottom:none;border-radius:6px 6px 0 0;color:#8b949e;font-family:inherit;font-size:.8rem;cursor:pointer;transition:all .15s;margin-bottom:-1px}
.tab-header:hover{color:#58a6ff}
.tab-header.active{background:#161b22;color:#58a6ff;border-color:#30363d}
.tab-content{background:#161b22;border:1px solid #30363d;border-radius:0 6px 6px 6px;padding:1rem;display:none}
.tab-content.active{display:block}
.tab-content h3{font-size:.85rem;color:#8b949e;margin-bottom:.5rem;font-weight:normal}
.tab-content .code-wrap{margin:.5rem 0}
.tab-content .code-wrap pre{background:#0d1117;border:1px solid #21262d;border-radius:4px}
.tab-content .code-wrap code{color:#7ee787;font-size:.8rem}
.tab-content .note{color:#8b949e;font-size:.75rem;margin-top:.5rem}
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

<h2>Add repository</h2>
<div class="tab-group">
<div class="tab-headers">
  <button class="tab-header active" onclick="showTab(this,'tab-curl')">curl | bash</button>
  <button class="tab-header" onclick="showTab(this,'tab-manual')">Manual</button>
</div>
<div class="tab-content active" id="tab-curl">
  <h3>One-liner (recommended)</h3>
  <div class="code-wrap">
    <pre><code>curl -fsSL ${safeAptOrigin} | sudo bash</code></pre>
    <button class="copy-btn" onclick="copyCmd(this,'curl -fsSL ${safeAptOrigin} | sudo bash')" aria-label="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
  </div>
  <p class="note">If ${safeAptOrigin} is unavailable, use the fallback:</p>
  <div class="code-wrap">
    <pre><code>curl -fsSL ${safeFallback} | sudo bash</code></pre>
    <button class="copy-btn" onclick="copyCmd(this,'curl -fsSL ${safeFallback} | sudo bash')" aria-label="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
  </div>
</div>
<div class="tab-content" id="tab-manual">
  <h3>Add GPG key</h3>
  <div class="code-wrap">
    <pre><code>${keyCmd}</code></pre>
    <button class="copy-btn" onclick="copyCmd(this,'${keyCmd.replace(/'/g, "\\'")}')" aria-label="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
  </div>
  <h3>Add repository</h3>
  <div class="code-wrap">
    <pre><code>echo "${sourcesLine}" | sudo tee /etc/apt/sources.list.d/daydve-apt-repo.list</code></pre>
    <button class="copy-btn" onclick="copyCmd(this,'echo \\'${sourcesLine}\\' | sudo tee /etc/apt/sources.list.d/daydve-apt-repo.list')" aria-label="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
  </div>
  <h3>Update package lists</h3>
  <div class="code-wrap">
    <pre><code>sudo apt update</code></pre>
    <button class="copy-btn" onclick="copyCmd(this,'sudo apt update')" aria-label="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
  </div>
</div>
</div>

<h2>Install packages</h2>
<p style="margin:.5rem 0">Via terminal:</p>
<div class="code-wrap">
  <pre><code>sudo apt install &lt;package-name&gt;</code></pre>
  <button class="copy-btn" onclick="copyCmd(this,'sudo apt install ')" aria-label="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
</div>
<p style="margin:.5rem 0">Or via package manager — browse packages for apt:// links:</p>
<p class="center"><a href="${safeOrigin}/packages" class="browse-link">Browse packages</a></p>

<p class="center" style="color:#8b949e;font-size:.85rem;margin-top:2rem"><a href="https://github.com/${env.REPO}">GitHub</a>${env.TELEGRAM ? ` · <a href="${env.TELEGRAM}">Telegram</a>` : ''} · Built for personal use</p>

<script>
${sharedScript()}
function showTab(btn,id){
  document.querySelectorAll('.tab-header').forEach(h=>h.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(id).classList.add('active');
}
</script>
</body>
</html>`;
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

// ── Package list ──

function pkgListRow(p: Package, aptOrigin: string, groupCats: string[]): string {
  const safeName = escapeHtml(p.name);
  const safeDesc = escapeHtml(p.description);
  const effectiveCats = p.group ? [...new Set([...(p.categories || []), ...groupCats])] : (p.categories || []);
  const cats = effectiveCats.map(c =>
    `<span class="tag" data-cat="${escapeHtml(c)}">${escapeHtml(catLabel(c))}</span>`
  ).join('');
  const iconUrl = p.icon ? `${escapeHtml(aptOrigin)}${escapeHtml(p.icon)}` : '';
  const fallbackIcon = `<svg class="row-icon fallback-icon" viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="#555" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="24" height="24" rx="4"/><path d="M12 11h8M12 16h8M12 21h5"/></svg>`;
  const iconHtml = iconUrl
    ? `<img class="row-icon" src="${iconUrl}" alt="${safeName}" width="32" height="32" loading="lazy" onerror="this.outerHTML=this.dataset.fallback" data-fallback='${fallbackIcon}'>`
    : fallbackIcon;
  const familyLabel = p.group ? `<span class="row-family">${escapeHtml(p.group)}</span>` : '';

  return `<a class="pkg-row" href="/packages/${safeName}" data-cats="${escapeHtml(effectiveCats.join(','))}" data-name="${safeName}">
  <div class="row-icon-wrap">${iconHtml}</div>
  <div class="row-info">
    <div class="row-name">${safeName}${familyLabel}</div>
    <div class="row-desc">${safeDesc}</div>
  </div>
  <div class="row-tags">${cats}</div>
</a>`;
}

async function servePackageList(url: URL, ctx: ExecutionContext, env: Env): Promise<Response> {
  const packagesUrl = `${repoOrigin(env.REPO)}/packages.json`;
  const pkgs = await fetchJSON(packagesUrl, 'https://_cache/packages-' + env.CACHE_BUST, ctx) as Package[] | null;

  const aptOrigin = env.APT_ORIGIN || url.origin;
  const siteName = env.SITE_NAME || '';
  const safeOrigin = escapeHtml(url.origin);
  const pkgCount = pkgs ? pkgs.length : 0;

  const allCats = new Set<string>();
  for (const p of pkgs || []) {
    for (const c of p.categories || []) allCats.add(c);
  }
  const sortedCats = [...allCats].sort();

  const catButtons = sortedCats.map(c =>
    `<button class="filter-btn" data-cat="${escapeHtml(c)}" onclick="filterCat('${escapeHtml(c)}')">${escapeHtml(catLabel(c))}</button>`
  ).join('');

  let rows = '';
  const groupCats = new Map<string, string[]>();
  for (const p of pkgs || []) {
    if (p.group && !groupCats.has(p.group) && (p.categories || []).length > 0) {
      groupCats.set(p.group, p.categories || []);
    }
  }
  for (const p of pkgs || []) {
    const gCats = p.group ? (groupCats.get(p.group) || []) : [];
    rows += pkgListRow(p, aptOrigin, gCats) + '\n';
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${siteName} — Packages</title>
<meta name="description" content="Browse and install packages from ${siteName}.">
<style>
${sharedStyles()}
.pkg-row{display:flex;align-items:center;gap:1rem;padding:.8rem 1rem;border:1px solid #21262d;border-radius:6px;text-decoration:none;color:#e6edf3;transition:all .15s}
.pkg-row:hover{border-color:#58a6ff;background:#161b22;text-decoration:none}
.pkg-row.hidden{display:none}
.row-icon-wrap{flex-shrink:0}
.row-icon{width:32px;height:32px;border-radius:6px}
.fallback-icon{background:#1a1a2e;border:1px solid #333}
.row-info{flex:1;min-width:0}
.row-name{font-weight:bold;font-size:.9rem;color:#e6edf3;display:flex;align-items:center;gap:.5rem}
.row-family{font-size:.7rem;color:#58a6ff;font-weight:normal}
.row-desc{font-size:.8rem;color:#8b949e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row-tags{display:flex;flex-wrap:wrap;gap:.3rem;flex-shrink:0}
.tag{font-size:.65rem;padding:.1rem .4rem;background:#30363d;border-radius:10px;color:#8b949e}
.list{display:flex;flex-direction:column;gap:.4rem;margin-top:1rem}
.toolbar{display:flex;flex-wrap:wrap;gap:.75rem;align-items:center;margin:1.5rem 0}
.search{flex:1;min-width:200px;padding:.6rem .8rem;background:#161b22;border:1px solid #30363d;border-radius:6px;color:#e6edf3;font-family:inherit;font-size:.85rem;outline:none}
.search:focus{border-color:#58a6ff}
.search::placeholder{color:#484f58}
.filters{display:flex;flex-wrap:wrap;gap:.4rem}
.filter-btn{padding:.3rem .6rem;background:#161b22;border:1px solid #30363d;border-radius:20px;color:#8b949e;font-family:inherit;font-size:.75rem;cursor:pointer;transition:all .15s}
.filter-btn:hover{border-color:#58a6ff;color:#58a6ff}
.filter-btn.active{background:#1f6feb;border-color:#1f6feb;color:#fff}
.count{color:#8b949e;font-size:.8rem;margin-left:auto;white-space:nowrap}
.header{text-align:center;padding:1.5rem 0}
.header h1{font-size:1.5rem;margin-bottom:.5rem}
.header p{color:#8b949e;font-size:.9rem}
.header .nav{margin-top:.75rem;font-size:.85rem}
.header .nav a{color:#8b949e;margin:0 .5rem}
.header .nav a:hover{color:#58a6ff}
.empty{text-align:center;padding:3rem;color:#484f58;font-size:.9rem}
.footer{text-align:center;padding:2rem 0 1rem;color:#484f58;font-size:.8rem}
.footer a{color:#8b949e}
@media(max-width:768px){.row-tags{display:none}.pkg-row{gap:.7rem;padding:.6rem .8rem}}
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

<div class="list" id="list">
${rows}
</div>

<div class="empty" id="empty" style="display:none">No packages match your search.</div>

<div class="footer">
  <p><a href="https://github.com/${escapeHtml(env.REPO)}">GitHub</a>${env.TELEGRAM ? ` · <a href="${escapeHtml(env.TELEGRAM)}">Telegram</a>` : ''}</p>
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
  const rows = document.querySelectorAll('.pkg-row');
  let visible = 0;
  rows.forEach(r => {
    const name = r.dataset.name || '';
    const cats = (r.dataset.cats || '').split(',');
    const text = r.textContent.toLowerCase();
    const matchSearch = !q || text.includes(q);
    const matchCat = activeCat === 'all' || cats.includes(activeCat);
    const show = matchSearch && matchCat;
    r.classList.toggle('hidden', !show);
    if (show) visible++;
  });
  document.getElementById('count').textContent = visible + ' package' + (visible !== 1 ? 's' : '');
  document.getElementById('empty').style.display = visible === 0 ? 'block' : 'none';
}
</script>

</body>
</html>`;

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

// ── Package detail ──

async function servePackageDetail(name: string, url: URL, ctx: ExecutionContext, env: Env): Promise<Response> {
  const packagesUrl = `${repoOrigin(env.REPO)}/packages.json`;
  const pkgs = await fetchJSON(packagesUrl, 'https://_cache/packages-' + env.CACHE_BUST, ctx) as Package[] | null;

  if (!pkgs) {
    return new Response('Package data unavailable', { status: 502 });
  }

  const pkg = pkgs.find(p => p.name === name);
  if (!pkg) {
    return new Response('Package not found', { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }

  const aptOrigin = env.APT_ORIGIN || url.origin;
  const siteName = env.SITE_NAME || '';
  const safeOrigin = escapeHtml(url.origin);
  const safeName = escapeHtml(pkg.name);
  const safeDesc = escapeHtml(pkg.description);
  const safeSource = escapeHtml(pkg.source || '');
  const installCmd = `sudo apt install ${pkg.name}`;
  const aptLink = `apt://${pkg.name}`;
  const longDesc = pkg.longDescription ? escapeHtml(pkg.longDescription) : safeDesc;

  const iconUrl = pkg.icon ? `${escapeHtml(aptOrigin)}${escapeHtml(pkg.icon)}` : '';
  const fallbackIcon = `<svg class="detail-icon fallback-icon" viewBox="0 0 96 96" width="96" height="96" fill="none" stroke="#555" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="80" height="80" rx="16"/><path d="M32 30h32M32 48h32M32 66h20"/></svg>`;
  const iconHtml = iconUrl
    ? `<img class="detail-icon" src="${iconUrl}" alt="${safeName}" width="96" height="96" onerror="this.outerHTML=this.dataset.fallback" data-fallback='${fallbackIcon}'>`
    : fallbackIcon;

  let familyHtml = '';
  if (pkg.group) {
    const members = pkgs.filter(p => p.group === pkg.group);
    if (members.length > 1) {
      const memberLinks = members
        .filter(m => m.name !== pkg.name)
        .map(m => `<a href="/packages/${escapeHtml(m.name)}">${escapeHtml(m.name)}</a>`)
        .join(' · ');
      if (memberLinks) {
        familyHtml = `<div class="detail-family">Part of <strong>${escapeHtml(pkg.group)}</strong>: ${memberLinks}</div>`;
      }
    }
  }

  const screenshots = pkg.screenshots || [];

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeName} — ${siteName}</title>
<meta name="description" content="${safeDesc}">
<style>
${sharedStyles()}
.back{display:inline-flex;align-items:center;gap:.3rem;color:#8b949e;font-size:.85rem;margin-bottom:1.5rem}
.back:hover{color:#58a6ff}
.detail-top{display:flex;align-items:flex-start;gap:1.2rem;margin-bottom:1.5rem}
.detail-icon{width:96px;height:96px;border-radius:16px;flex-shrink:0}
.fallback-icon{background:#1a1a2e;border:1px solid #333}
.detail-title{font-size:1.5rem;font-weight:bold;margin-bottom:.3rem}
.detail-title a{color:#58a6ff}
.detail-desc{color:#8b949e;font-size:.9rem}
.detail-family{font-size:.8rem;color:#58a6ff;margin-top:.3rem}
.detail-family strong{font-weight:bold}
.detail-section{margin:1.5rem 0}
.detail-section h2{font-size:1rem;color:#e6edf3;margin-bottom:.5rem;font-weight:bold}
.detail-long{color:#c9d1d9;font-size:.9rem;line-height:1.8}
.detail-links{display:flex;flex-wrap:wrap;gap:.5rem;margin:.8rem 0}
.detail-links a{padding:.4rem .8rem;border:1px solid #30363d;border-radius:4px;font-size:.8rem;color:#58a6ff;transition:all .15s}
.detail-links a:hover{border-color:#58a6ff;background:#161b22;text-decoration:none}
.detail-links a.apt-link{background:#1f6feb;border-color:#1f6feb;color:#fff}
.detail-links a.apt-link:hover{background:#388bfd;border-color:#388bfd}
.install-block{margin:.8rem 0}
.install-block .code-wrap pre{background:#0d1117;border:1px solid #21262d;border-radius:4px}
.install-block .code-wrap code{color:#7ee787;font-size:.85rem}
.screenshots{display:flex;gap:.8rem;overflow-x:auto;padding:.5rem 0}
.screenshots img{max-height:300px;border-radius:8px;border:1px solid #30363d}
.footer{text-align:center;padding:2rem 0 1rem;color:#484f58;font-size:.8rem}
.footer a{color:#8b949e}
@media(max-width:600px){.detail-top{flex-direction:column;align-items:center;text-align:center}.detail-icon{width:72px;height:72px}.detail-links{justify-content:center}}
</style>
</head>
<body>

<a href="/packages" class="back">&larr; All packages</a>

<div class="detail-top">
  ${iconHtml}
  <div>
    <h1 class="detail-title">${safeSource ? `<a href="${safeSource}" target="_blank" rel="noopener">${safeName}</a>` : safeName}</h1>
    <p class="detail-desc">${safeDesc}</p>
    ${familyHtml}
  </div>
</div>

${screenshots.length > 0 ? `
<div class="detail-section">
  <div class="screenshots">
    ${screenshots.map(s => `<img src="${escapeHtml(s)}" alt="${safeName} screenshot" loading="lazy">`).join('\n    ')}
  </div>
</div>` : ''}

<div class="detail-section">
  <h2>About</h2>
  <div class="detail-long">${longDesc.replace(/\n/g, '<br>')}</div>
</div>

<div class="detail-section">
  <h2>Install</h2>
  <div class="detail-links">
    <a href="${escapeHtml(aptLink)}" class="apt-link">Install via package manager</a>
    ${safeSource ? `<a href="${safeSource}" target="_blank" rel="noopener">Source code</a>` : ''}
  </div>
  <div class="install-block">
    <div class="code-wrap">
      <pre><code>${escapeHtml(installCmd)}</code></pre>
      <button class="copy-btn" onclick="copyCmd(this,'${escapeHtml(installCmd)}')" aria-label="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
    </div>
  </div>
</div>

<div class="footer">
  <p><a href="https://github.com/${escapeHtml(env.REPO)}">GitHub</a>${env.TELEGRAM ? ` · <a href="${escapeHtml(env.TELEGRAM)}">Telegram</a>` : ''}</p>
</div>

<script>${sharedScript()}</script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
