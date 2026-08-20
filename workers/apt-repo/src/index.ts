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

    if (path.startsWith('/screenshots/')) {
      return proxy(`${repoOrigin(env.REPO)}${path}`);
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
body{font-family:'Courier New',Courier,monospace;max-width:800px;margin:0 auto;padding:0;line-height:1.6;color:#c8d6e5;background:#0a0e14}
a{color:#7ec8e3;text-decoration:none}
a:hover{color:#fff}
pre{background:#0d1117;padding:.8rem 1rem;overflow-x:auto;font-size:.82rem;margin:0;border:0!important;border-left:2px solid #2d3748}
pre code{background:transparent!important;padding:0!important}
.code-wrap{position:relative}
.copy-btn{position:absolute;top:4px;right:4px;background:none;border:none;cursor:pointer;color:#3a4a5c;padding:4px;line-height:0}
.copy-btn:hover{color:#7ec8e3}
.copy-btn.copied svg{stroke:#5dde8b}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0}
.center{text-align:center}
.tui-box{border:1px solid #2d3748;margin:1rem 0;padding:1.2rem;position:relative}
.tui-box::before{content:attr(data-title);position:absolute;top:-.6rem;left:1rem;background:#0a0e14;padding:0 .5rem;font-size:.7rem;color:#5dde8b;text-transform:uppercase;letter-spacing:.05em}
.tui-label{color:#5dde8b}
.tui-key{display:inline-block;background:#1a2332;border:1px solid #2d3748;border-radius:2px;padding:.05rem .35rem;font-size:.75rem;color:#7ec8e3;min-width:1.2rem;text-align:center}
.tui-hr{border:none;border-top:1px solid #1e2a3a;margin:.8rem 0}`;
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
.tui-status{position:fixed;bottom:0;left:0;right:0;background:#0d1117;border-top:1px solid #2d3748;padding:.3rem 1rem;display:flex;justify-content:space-between;font-size:.7rem;color:#3a4a5c;z-index:10}
.tui-status a{color:#3a4a5c}.tui-status a:hover{color:#7ec8e3}
.tab-headers{display:flex;gap:0;margin-bottom:0}
.tab-header{padding:.3rem .8rem;background:none;border:1px solid #2d3748;border-bottom:none;color:#5a6a7c;font-family:inherit;font-size:.78rem;cursor:pointer;transition:all .15s}
.tab-header:hover{color:#7ec8e3}
.tab-header.active{background:#0d1117;color:#5dde8b;border-bottom-color:#0d1117}
.tab-content{border:1px solid #2d3748;padding:1rem;display:none;margin-top:-1px}
.tab-content.active{display:block}
.tab-content h3{font-size:.8rem;color:#5dde8b;margin-bottom:.4rem;font-weight:normal}
.tab-content h3::before{content:'> ';color:#3a4a5c}
.tab-content .code-wrap{margin:.4rem 0}
.tab-content .code-wrap pre{background:#0d1117;border-left:2px solid #2d3748}
.tab-content .code-wrap code{color:#5dde8b;font-size:.78rem}
.tab-content .note{color:#3a4a5c;font-size:.72rem;margin-top:.4rem}
.browse-link{display:inline-block;margin:1rem 0;padding:.4rem 1rem;border:1px solid #2d3748;color:#7ec8e3;font-size:.85rem;text-decoration:none;transition:all .15s}
.browse-link:hover{border-color:#5dde8b;color:#5dde8b;text-decoration:none}
.browse-link::before{content:'[ '}.browse-link::after{content:' ]'}
.ascii-wide{display:block}
.ascii-narrow{display:none}
@media(max-width:768px){.ascii-wide{display:none}.ascii-narrow{display:block}}
</style>
</head>
<body>
<h1 class="sr-only">${siteName}</h1>
<div class="center ascii-wide"><div style="white-space:pre;line-height:1.2;color:#3a4a5c">
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
<div class="center ascii-narrow"><div style="white-space:pre;line-height:1.2;color:#3a4a5c">
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

<div class="tui-box" data-title="packages">
  <div class="center">
    <span class="tui-label">${pkgCount}</span> packages available for Ubuntu Noble
    <br>
    <a href="${safeOrigin}/packages" class="browse-link">Browse packages</a>
  </div>
</div>

<div class="tui-box" data-title="setup">
  <div class="tab-group">
    <div class="tab-headers">
      <button class="tab-header active" onclick="showTab(this,'tab-curl')">[1] curl | bash</button>
      <button class="tab-header" onclick="showTab(this,'tab-manual')">[2] manual</button>
    </div>
    <div class="tab-content active" id="tab-curl">
      <h3>One-liner</h3>
      <div class="code-wrap">
        <pre><code>curl -fsSL ${safeAptOrigin} | sudo bash</code></pre>
        <button class="copy-btn" onclick="copyCmd(this,'curl -fsSL ${safeAptOrigin} | sudo bash')" aria-label="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
      </div>
      <p class="note">Failsafe: <code style="color:#7ec8e3;font-size:.72rem">${safeFallback}</code></p>
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
</div>

<div class="tui-box" data-title="install">
  <div class="code-wrap">
    <pre><code>sudo apt install <span style="color:#f5a962">&lt;package-name&gt;</span></code></pre>
    <button class="copy-btn" onclick="copyCmd(this,'sudo apt install ')" aria-label="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
  </div>
  <p style="font-size:.78rem;color:#3a4a5c;margin-top:.5rem">Browse <a href="${safeOrigin}/packages">packages</a> for apt:// links</p>
</div>

<div class="tui-status">
  <span><a href="${safeOrigin}">home</a> | <a href="${safeOrigin}/packages">packages</a> | <a href="https://github.com/${env.REPO}">github</a>${env.TELEGRAM ? ` | <a href="${env.TELEGRAM}">telegram</a>` : ''}</span>
  <span>built for personal use</span>
</div>

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
  ).join(' ');
  const iconUrl = p.icon ? `${escapeHtml(aptOrigin)}${escapeHtml(p.icon)}` : '';
  const fallbackIcon = `<span style="color:#3a4a5c">[ ]</span>`;
  const iconHtml = iconUrl
    ? `<img class="row-icon" src="${iconUrl}" alt="${safeName}" width="20" height="20" loading="lazy" onerror="this.outerHTML=this.dataset.fallback" data-fallback='${fallbackIcon}'>`
    : fallbackIcon;
  const familyLabel = p.group ? `<span class="row-family">(${escapeHtml(p.group)})</span>` : '';

  return `<a class="pkg-row" href="/packages/${safeName}" data-cats="${escapeHtml(effectiveCats.join(','))}" data-name="${safeName}">
  <span class="row-icon-wrap">${iconHtml}</span>
  <span class="row-name"><span class="row-arrow">&gt;</span> ${safeName}${familyLabel}</span>
  <span class="row-desc">${safeDesc}</span>
  <span class="row-tags">${cats}</span>
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
  ).join(' ');

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
.pkg-row{display:flex;align-items:center;gap:.6rem;padding:.4rem .8rem;text-decoration:none;color:#c8d6e5;transition:all .1s;font-size:.85rem}
.pkg-row:hover{background:#111922;text-decoration:none}
.pkg-row.hidden{display:none}
.row-icon-wrap{flex-shrink:0;width:20px;text-align:center}
.row-icon{width:20px;height:20px;border-radius:2px;vertical-align:middle}
.row-arrow{color:#3a4a5c;font-size:.8rem;transition:color .1s}
.pkg-row:hover .row-arrow{color:#5dde8b}
.row-name{font-weight:bold;color:#7ec8e3;white-space:nowrap;flex-shrink:0}
.row-family{font-size:.72rem;color:#5a6a7c;font-weight:normal}
.row-desc{flex:1;min-width:0;color:#5a6a7c;font-size:.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row-tags{display:flex;flex-wrap:wrap;gap:.3rem;flex-shrink:0}
.tag{font-size:.65rem;padding:.05rem .35rem;background:#111922;border:1px solid #1e2a3a;color:#5a6a7c}
.list{margin-top:.5rem}
.toolbar{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}
.search{flex:1;min-width:200px;padding:.4rem .6rem;background:#0d1117;border:1px solid #2d3748;color:#c8d6e5;font-family:inherit;font-size:.82rem;outline:none}
.search:focus{border-color:#7ec8e3}
.search::placeholder{color:#3a4a5c}
.filters{display:flex;flex-wrap:wrap;gap:.3rem}
.filter-btn{padding:.15rem .4rem;background:none;border:1px solid #2d3748;color:#5a6a7c;font-family:inherit;font-size:.72rem;cursor:pointer;transition:all .1s}
.filter-btn:hover{border-color:#7ec8e3;color:#7ec8e3}
.filter-btn.active{background:#1a2332;border-color:#5dde8b;color:#5dde8b}
.count{color:#3a4a5c;font-size:.75rem;margin-left:auto;white-space:nowrap}
.header{padding:1rem 0 .5rem}
.header h1{font-size:1.1rem;color:#5dde8b;font-weight:normal}
.header h1::before{content:'$ ';color:#3a4a5c}
.header p{color:#5a6a7c;font-size:.8rem}
.header .nav{margin-top:.4rem;font-size:.78rem}
.header .nav a{color:#5a6a7c;margin:0 .4rem}
.header .nav a:hover{color:#7ec8e3}
.empty{text-align:center;padding:2rem;color:#3a4a5c;font-size:.85rem}
.tui-status{position:fixed;bottom:0;left:0;right:0;background:#0d1117;border-top:1px solid #2d3748;padding:.3rem 1rem;display:flex;justify-content:space-between;font-size:.7rem;color:#3a4a5c;z-index:10}
.tui-status a{color:#3a4a5c}.tui-status a:hover{color:#7ec8e3}
@media(max-width:768px){.row-tags{display:none}.pkg-row{gap:.4rem;padding:.3rem .6rem}.row-desc{display:none}}
</style>
</head>
<body>

<div class="header">
  <h1>${siteName || 'Packages'}</h1>
  <p>${pkgCount} packages available for Ubuntu Noble</p>
</div>

<div class="tui-box" data-title="filter">
  <div class="toolbar">
    <input type="text" class="search" placeholder="Type to filter..." oninput="filterAll()" id="search">
    <div class="filters">
      <button class="filter-btn active" data-cat="all" onclick="filterCat('all')">all</button>
      ${catButtons}
    </div>
    <span class="count" id="count">${pkgCount}</span>
  </div>
</div>

<div class="list" id="list">
${rows}
</div>

<div class="empty" id="empty" style="display:none">No packages match.</div>

<div class="tui-status">
  <span><a href="${safeOrigin}">home</a> | <a href="${safeOrigin}/packages">packages</a> | <a href="https://github.com/${escapeHtml(env.REPO)}">github</a></span>
  <span id="status-count">${pkgCount} packages</span>
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
    const cats = (r.dataset.cats || '').split(',');
    const text = r.textContent.toLowerCase();
    const matchSearch = !q || text.includes(q);
    const matchCat = activeCat === 'all' || cats.includes(activeCat);
    const show = matchSearch && matchCat;
    r.classList.toggle('hidden', !show);
    if (show) visible++;
  });
  document.getElementById('count').textContent = visible + '';
  document.getElementById('status-count').textContent = visible + ' packages';
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
  const fallbackIcon = `<span style="color:#3a4a5c;font-size:2rem">[ ]</span>`;
  const iconHtml = iconUrl
    ? `<img class="detail-icon" src="${iconUrl}" alt="${safeName}" width="48" height="48" onerror="this.outerHTML=this.dataset.fallback" data-fallback='${fallbackIcon}'>`
    : fallbackIcon;

  let familyHtml = '';
  if (pkg.group) {
    const members = pkgs.filter(p => p.group === pkg.group);
    if (members.length > 1) {
      const memberLinks = members
        .filter(m => m.name !== pkg.name)
        .map(m => `<a href="/packages/${escapeHtml(m.name)}">${escapeHtml(m.name)}</a>`)
        .join(' | ');
      if (memberLinks) {
        familyHtml = `<div class="detail-family">family: <span class="tui-label">${escapeHtml(pkg.group)}</span> &mdash; ${memberLinks}</div>`;
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
.back{display:inline-flex;align-items:center;gap:.3rem;color:#5a6a7c;font-size:.8rem;margin-bottom:1rem}
.back:hover{color:#7ec8e3}
.back::before{content:'< '}
.detail-top{display:flex;align-items:center;gap:1rem;margin-bottom:1rem}
.detail-icon{width:48px;height:48px;border-radius:4px;flex-shrink:0}
.detail-title{font-size:1.2rem;font-weight:bold;color:#7ec8e3}
.detail-title a{color:#7ec8e3}
.detail-title a:hover{color:#fff}
.detail-title::before{content:'$ ';color:#3a4a5c}
.detail-desc{color:#5a6a7c;font-size:.85rem}
.detail-family{font-size:.78rem;color:#5a6a7c;margin-top:.3rem}
.detail-section{margin:1rem 0}
.detail-section h2{font-size:.85rem;color:#5dde8b;margin-bottom:.4rem;font-weight:normal}
.detail-section h2::before{content:'## '}
.detail-long{color:#c8d6e5;font-size:.85rem;line-height:1.8}
.detail-links{display:flex;flex-wrap:wrap;gap:.4rem;margin:.5rem 0}
.detail-links a{padding:.3rem .6rem;border:1px solid #2d3748;font-size:.8rem;color:#7ec8e3;transition:all .1s}
.detail-links a:hover{border-color:#5dde8b;color:#5dde8b;text-decoration:none}
.detail-links a.apt-link{background:#1a2332;border-color:#5dde8b;color:#5dde8b}
.detail-links a.apt-link:hover{background:#243344}
.install-block{margin:.5rem 0}
.install-block .code-wrap pre{border-left:2px solid #5dde8b}
.install-block .code-wrap code{color:#5dde8b;font-size:.82rem}
.screenshots{position:relative;overflow:hidden}
.screenshots-track{display:flex;transition:transform .3s ease}
.screenshots-track img{width:100%;flex-shrink:0;cursor:pointer;transition:opacity .15s;object-fit:contain;max-height:400px}
.screenshots-track img:hover{opacity:.85}
.ss-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(10,14,20,.7);border:1px solid #2d3748;color:#5a6a7c;font-size:1.2rem;cursor:pointer;padding:.3rem .6rem;z-index:2;transition:color .15s;font-family:inherit}
.ss-nav:hover{color:#7ec8e3}
.ss-prev{left:.5rem}
.ss-next{right:.5rem}
.ss-dots{display:flex;justify-content:center;gap:.3rem;margin-top:.4rem}
.ss-dot{width:6px;height:6px;background:#2d3748;border:none;cursor:pointer;transition:background .15s;padding:0}
.ss-dot.active{background:#5dde8b}
.lightbox{display:none;position:fixed;inset:0;z-index:100;background:rgba(10,14,20,.95);align-items:center;justify-content:center}
.lightbox.open{display:flex}
.lightbox img{max-width:85vw;max-height:85vh;object-fit:contain;cursor:pointer}
.lightbox-close{position:absolute;top:.8rem;right:1rem;background:none;border:none;color:#5a6a7c;font-size:1.5rem;cursor:pointer;padding:.2rem .5rem}
.lightbox-close:hover{color:#c8d6e5}
.lb-nav{position:absolute;top:50%;transform:translateY(-50%);background:none;border:1px solid #2d3748;color:#5a6a7c;font-size:1.5rem;cursor:pointer;padding:.3rem .8rem;z-index:2;transition:color .15s;font-family:inherit}
.lb-nav:hover{color:#7ec8e3}
.lb-prev{left:.5rem}
.lb-next{right:.5rem}
.tui-status{position:fixed;bottom:0;left:0;right:0;background:#0d1117;border-top:1px solid #2d3748;padding:.3rem 1rem;display:flex;justify-content:space-between;font-size:.7rem;color:#3a4a5c;z-index:10}
.tui-status a{color:#3a4a5c}.tui-status a:hover{color:#7ec8e3}
@media(max-width:600px){.detail-top{flex-direction:column;align-items:flex-start}.detail-links{flex-direction:column}.detail-links a{width:100%;text-align:center}}
</style>
</head>
<body>

<a href="/packages" class="back">All packages</a>

<div class="tui-box" data-title="${safeName}">
  <div class="detail-top">
    ${iconHtml}
    <div>
      <h1 class="detail-title">${safeSource ? `<a href="${safeSource}" target="_blank" rel="noopener">${safeName}</a>` : safeName}</h1>
      <p class="detail-desc">${safeDesc}</p>
      ${familyHtml}
    </div>
  </div>
</div>

${screenshots.length > 0 ? `
<div class="tui-box" data-title="screenshots">
  <div class="screenshots">
    ${screenshots.length > 1 ? '<button class="ss-nav ss-prev" onclick="ssSlide(-1)">&#8249;</button>' : ''}
    <div class="screenshots-track" id="ss-track">
      ${screenshots.map(s => `<img src="${escapeHtml(s)}" alt="${safeName} screenshot" loading="lazy" onclick="openLb(this.src)">`).join('\n      ')}
    </div>
    ${screenshots.length > 1 ? '<button class="ss-nav ss-next" onclick="ssSlide(1)">&#8250;</button>' : ''}
  </div>
  ${screenshots.length > 1 ? `<div class="ss-dots" id="ss-dots">${screenshots.map((_, i) => `<button class="ss-dot${i === 0 ? ' active' : ''}" onclick="ssGo(${i})"></button>`).join('')}</div>` : ''}
</div>` : ''}

<div class="lightbox" id="lb" onclick="closeLb()">
  <button class="lightbox-close" onclick="closeLb()">&times;</button>
  ${screenshots.length > 1 ? '<button class="lb-nav lb-prev" onclick="event.stopPropagation();lbSlide(-1)">&#8249;</button><button class="lb-nav lb-next" onclick="event.stopPropagation();lbSlide(1)">&#8250;</button>' : ''}
  <img id="lb-img" src="" alt="" onclick="event.stopPropagation()">
</div>

<div class="tui-box" data-title="about">
  <div class="detail-long">${longDesc.replace(/\n/g, '<br>')}</div>
</div>

<div class="tui-box" data-title="install">
  <div class="detail-links">
    <a href="${escapeHtml(aptLink)}" class="apt-link">apt:// install</a>
    ${safeSource ? `<a href="${safeSource}" target="_blank" rel="noopener">homepage</a>` : ''}
  </div>
  <div class="install-block">
    <div class="code-wrap">
      <pre><code>${escapeHtml(installCmd)}</code></pre>
      <button class="copy-btn" onclick="copyCmd(this,'${escapeHtml(installCmd)}')" aria-label="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
    </div>
  </div>
</div>

<div class="tui-status">
  <span><a href="${safeOrigin}">home</a> | <a href="${safeOrigin}/packages">packages</a> | <a href="https://github.com/${escapeHtml(env.REPO)}">github</a></span>
  <span>${safeName}</span>
</div>

<script>${sharedScript()}
let ssIdx=0;const ssTotal=${screenshots.length};
function ssGo(i){ssIdx=((i%ssTotal)+ssTotal)%ssTotal;document.getElementById('ss-track').style.transform='translateX(-'+ssIdx*100+'%)';document.querySelectorAll('.ss-dot').forEach((d,j)=>d.classList.toggle('active',j===ssIdx))}
function ssSlide(d){ssGo(ssIdx+d)}
let lbIdx=0;
function openLb(src){const imgs=document.querySelectorAll('.screenshots-track img');lbIdx=[...imgs].findIndex(i=>i.src===src);const lb=document.getElementById('lb');document.getElementById('lb-img').src=src;lb.classList.add('open');document.body.style.overflow='hidden'}
function closeLb(){document.getElementById('lb').classList.remove('open');document.body.style.overflow=''}
function lbSlide(d){const imgs=document.querySelectorAll('.screenshots-track img');lbIdx=((lbIdx+d)%imgs.length+imgs.length)%imgs.length;document.getElementById('lb-img').src=imgs[lbIdx].src}
document.addEventListener('keydown',e=>{const lb=document.getElementById('lb').classList.contains('open');if(e.key==='Escape')closeLb();if(e.key==='ArrowLeft'){lb?lbSlide(-1):ssSlide(-1)}if(e.key==='ArrowRight'){lb?lbSlide(1):ssSlide(1)}});
</script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
