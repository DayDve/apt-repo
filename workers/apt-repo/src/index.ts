interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

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
  const resp = await fetch(url, { cf: { cacheTtl: -1 } } as any);
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
  const cache = (caches as any).default;
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
  let filename = path.split('/').pop()!;
  try {
    filename = decodeURIComponent(filename);
  } catch {}
  const poolMapUrl = `${repoOrigin(env.REPO)}/pool-map.json`;
  const map = await fetchJSON(poolMapUrl, 'https://_cache/pool-map-' + env.CACHE_BUST, ctx) as Record<string, string> | null;
  if (!map || !map[filename]) return new Response('Not found', { status: 404 });
  return Response.redirect(
    `https://github.com/${env.REPO}/releases/download/${encodeURIComponent(map[filename])}/${encodeURIComponent(filename)}`,
    302,
  );
}

// ── Origins ──

function getOrigins(env: Env): { aptOrigin: string; fallbackOrigin: string } {
  const aptOrigin = (env.APT_ORIGIN && !env.APT_ORIGIN.includes('workers.dev'))
    ? env.APT_ORIGIN
    : 'https://apt.smbit.pro';
  const fallbackOrigin = (env.APT_ORIGIN && env.APT_ORIGIN.includes('workers.dev'))
    ? env.APT_ORIGIN
    : (env.AUTHOR ? `https://apt-repo.${env.AUTHOR.toLowerCase()}.workers.dev` : 'https://apt-repo.daydve.workers.dev');
  return { aptOrigin, fallbackOrigin };
}

// ── Shared design & icons ──

const CAT_LABELS: Record<string, string> = {
  System: 'System', Network: 'Network', InstantMessaging: 'Messaging',
  Office: 'Office', Fonts: 'Fonts', Utility: 'Utility',
  FileTransfer: 'File Transfer', RemoteAccess: 'Remote Access',
  FileTools: 'File Tools', Boot: 'Boot', Hardware: 'Hardware',
  Emulator: 'Emulator', Development: 'Development',
  Filesystem: 'Filesystem', Security: 'Security',
};

function catLabel(c: string): string { return CAT_LABELS[c] || c; }

function iconPackage(size = 18): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`;
}

function iconCopy(size = 14): string {
  return `<svg class="icon-copy" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
}

function iconCheck(size = 14): string {
  return `<svg class="icon-check" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
}

function iconChevronLeft(size = 20): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`;
}

function iconChevronRight(size = 20): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;
}

function iconClose(size = 20): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
}

function sharedHead(title: string, desc: string, extraCss: string = ''): string {
  return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta name="theme-color" content="#0d1117">
<style>
:root {
  --bg-body: #0d1117;
  --bg-surface: #161b22;
  --bg-surface-hover: #1f242c;
  --bg-code: #090d13;
  --bg-code-header: #121720;
  --bg-tag: rgba(56, 139, 253, 0.1);
  --border: #30363d;
  --border-muted: #21262d;
  --text-primary: #e6edf3;
  --text-secondary: #8b949e;
  --text-muted: #6e7681;
  --accent: #58a6ff;
  --accent-btn: #1f6feb;
  --accent-btn-hover: #388bfd;
  --success: #3fb950;
  --syn-cmd: #79c0ff;
  --syn-arg: #a5d6ff;
  --syn-flag: #d2a8ff;
  --syn-str: #7ee787;
  --syn-opt: #ffa657;
  --syn-pipe: #8b949e;
  --syn-path: #a5d6ff;
  --syn-comment: #8b949e;
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-full: 20px;
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  --font-mono: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  --transition: 120ms ease;
}
*{box-sizing:border-box;margin:0;padding:0}
html{background-color:var(--bg-body);color-scheme:dark}
body{font-family:var(--font-sans);max-width:860px;margin:0 auto;padding:1.5rem 1.25rem 3rem;line-height:1.6;color:var(--text-primary);background:var(--bg-body);-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none;transition:color var(--transition)}
a:hover{text-decoration:underline}
pre,code{font-family:var(--font-mono)}
code{font-size:.85em}

/* Terminal & Code Blocks */
.term-box{background:var(--bg-code);border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;margin:0.4rem 0}
.term-header{display:flex;align-items:center;justify-content:space-between;padding:0.35rem 0.75rem;background:var(--bg-code-header);border-bottom:1px solid var(--border-muted);font-size:0.75rem;color:var(--text-secondary)}
.term-title{font-family:var(--font-mono);font-size:0.75rem;color:var(--text-secondary)}
.term-body{position:relative}
.term-body pre{padding:0.75rem 0.9rem;overflow-x:auto;font-size:0.84rem;line-height:1.5;background:transparent;margin:0}
.term-body pre code{color:var(--text-primary);background:transparent;padding:0}

/* Syntax Highlighting */
.hl-cmd{color:var(--syn-cmd);font-weight:600}
.hl-flag{color:var(--syn-flag)}
.hl-str{color:var(--syn-str)}
.hl-arg{color:var(--syn-arg)}
.hl-opt{color:var(--syn-opt)}
.hl-pipe{color:var(--syn-pipe);font-weight:600}
.hl-path{color:var(--syn-path)}
.hl-comment{color:var(--syn-comment);font-style:italic}

/* Copy Button */
.copy-btn{display:inline-flex;align-items:center;gap:0.35rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-secondary);padding:0.2rem 0.5rem;font-size:0.75rem;font-family:inherit;cursor:pointer;transition:all var(--transition)}
.copy-btn:hover{background:var(--bg-surface-hover);border-color:var(--accent);color:var(--text-primary);text-decoration:none}
.copy-btn .icon-check{display:none}
.copy-btn.copied{border-color:var(--success);color:var(--success);background:rgba(63,185,80,0.1)}
.copy-btn.copied .icon-copy{display:none}
.copy-btn.copied .icon-check{display:inline-block}

/* Header */
.site-header{text-align:center;padding:1rem 0 1.25rem;border-bottom:1px solid var(--border-muted);margin-bottom:1.5rem}
.brand-title{font-size:1.35rem;font-weight:700;margin-bottom:0.25rem;color:var(--text-primary)}
.brand-sub{color:var(--text-secondary);font-size:0.88rem}
.site-nav{margin-top:0.6rem;font-size:0.85rem;display:flex;justify-content:center;gap:0.85rem}
.nav-link{color:var(--text-secondary);transition:color var(--transition)}
.nav-link:hover{color:var(--accent);text-decoration:underline}
.nav-link.active{color:var(--text-primary);font-weight:600}

/* Footer */
.site-footer{text-align:center;padding:1.5rem 0 0.5rem;border-top:1px solid var(--border-muted);margin-top:2.5rem;font-size:0.8rem}
.site-footer a{color:var(--text-secondary);margin:0 0.35rem}
.site-footer a:hover{color:var(--accent);text-decoration:underline}
.footer-note{color:var(--text-muted);font-size:0.78rem;margin-top:0.35rem}

/* Section Headings */
.sec{margin-bottom:1.75rem}
.sec-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:0.6rem}
.sec-title{font-size:0.95rem;font-weight:600;color:var(--text-primary);display:flex;align-items:center;gap:0.4rem}
.sec-badge{display:inline-flex;align-items:center;font-size:0.75rem;font-weight:600;padding:0.1rem 0.45rem;border-radius:var(--radius-full);background:var(--bg-surface);color:var(--text-secondary);border:1px solid var(--border)}

/* Badges & Tags */
.tag{display:inline-flex;align-items:center;font-size:0.7rem;padding:0.15rem 0.5rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-full);color:var(--text-secondary);white-space:nowrap}
.family-badge{display:inline-flex;align-items:center;font-size:0.72rem;padding:0.1rem 0.45rem;background:var(--bg-tag);border:1px solid rgba(88,166,255,0.3);border-radius:var(--radius-sm);color:var(--accent);font-weight:500}

/* Tabs */
.tab-h{display:flex;align-items:center;border-bottom:1px solid var(--border-muted);margin-bottom:0.6rem}
.tab-b{padding:0.4rem 0.85rem;background:none;border:none;border-bottom:2px solid transparent;color:var(--text-secondary);font-family:inherit;font-size:0.85rem;cursor:pointer;transition:all var(--transition)}
.tab-b:hover{color:var(--text-primary)}
.tab-b.active{color:var(--accent);border-bottom-color:var(--accent);font-weight:600}

.note{font-size:0.8rem;color:var(--text-secondary);margin:0.6rem 0 0.25rem}

/* Buttons */
.btn-primary{display:inline-flex;align-items:center;gap:0.45rem;padding:0.45rem 0.9rem;background:var(--accent-btn);border:1px solid rgba(240,246,252,0.1);border-radius:var(--radius-md);color:#fff;font-family:inherit;font-size:0.85rem;font-weight:600;cursor:pointer;text-decoration:none;transition:background var(--transition)}
.btn-primary:hover{background:var(--accent-btn-hover);color:#fff;text-decoration:none}
.btn-secondary{display:inline-flex;align-items:center;gap:0.45rem;padding:0.45rem 0.9rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--accent);font-family:inherit;font-size:0.85rem;cursor:pointer;text-decoration:none;transition:all var(--transition)}
.btn-secondary:hover{background:var(--bg-surface-hover);border-color:var(--accent);text-decoration:none}

${extraCss}</style>`;
}

function sharedHeader(siteName: string, repo: string, activePage: 'home' | 'packages' = 'home', telegram?: string): string {
  const safeSite = escapeHtml(siteName || 'DayDve APT Repository');
  const homeActive = activePage === 'home' ? ' active' : '';
  const pkgsActive = activePage === 'packages' ? ' active' : '';

  return `<header class="site-header">
<h1 class="brand-title">${safeSite}</h1>
<p class="brand-sub">Software unavailable or outdated in standard repos</p>
<nav class="site-nav">
<a href="/" class="nav-link${homeActive}">Home</a>
<a href="/packages" class="nav-link${pkgsActive}">Packages</a>
<a href="https://github.com/${escapeHtml(repo)}" target="_blank" rel="noopener" class="nav-link">GitHub</a>
${telegram ? `<a href="${escapeHtml(telegram)}" target="_blank" rel="noopener" class="nav-link">Telegram</a>` : ''}
</nav>
</header>`;
}

function sharedFooter(repo: string, telegram?: string): string {
  return `<footer class="site-footer">
<div>
<a href="https://github.com/${escapeHtml(repo)}" target="_blank" rel="noopener">GitHub</a>
${telegram ? `· <a href="${escapeHtml(telegram)}" target="_blank" rel="noopener">Telegram</a>` : ''}
</div>
<div class="footer-note">Built for personal use</div>
</footer>`;
}

function sharedScript(): string {
  return `function copyCmd(b,t){navigator.clipboard.writeText(t).then(()=>{b.classList.add('copied');const l=b.querySelector('.copy-text');if(l)l.textContent='Copied!';setTimeout(()=>{b.classList.remove('copied');if(l)l.textContent='Copy'},2000)}).catch(()=>{})}`;
}

// ── Text endpoint (for curl | bash) ──

function displayEntries(pkgs: Package[]): { kind: 'family'|'pkg'; name: string; head?: Package; members?: Package[]; pkg?: Package }[] {
  const groups = new Map<string, Package[]>();
  const standalone: Package[] = [];
  for (const p of pkgs) {
    if (p.group) { const a = groups.get(p.group) || []; a.push(p); groups.set(p.group, a); }
    else standalone.push(p);
  }
  const entries: { kind: 'family'|'pkg'; name: string; head?: Package; members?: Package[]; pkg?: Package }[] = [];
  for (const [g, members] of groups.entries()) {
    members.sort((a, b) => a.name.localeCompare(b.name));
    if (members.length < 1) { standalone.push(members[0]); continue; }
    entries.push({ kind: 'family', name: g, head: members.find(m => m.name === g) || members[0], members });
  }
  for (const p of standalone) entries.push({ kind: 'pkg', name: p.name, pkg: p });
  entries.sort((a, b) => a.kind !== b.kind ? (a.kind === 'family' ? -1 : 1) : a.name.localeCompare(b.name));
  return entries;
}

function pkgLine(e: { kind: string; name: string; head?: Package; members?: Package[]; pkg?: Package }): string {
  if (e.kind === 'pkg' && e.pkg) return `#  ${e.pkg.name} - ${e.pkg.description}`;
  if (e.head && e.members) return `#  ${e.name} - ${e.head.description} (packages: ${e.members.map(m => m.name).join(', ')})`;
  return '';
}

async function serveText(url: URL, ctx: ExecutionContext, env: Env): Promise<Response> {
  const { fallbackOrigin } = getOrigins(env);
  const author = env.AUTHOR || '';
  const packagesUrl = `${repoOrigin(env.REPO)}/packages.json`;
  const pkgs = await fetchJSON(packagesUrl, 'https://_cache/packages-' + env.CACHE_BUST, ctx) as Package[] | null;

  let pkgLines: string[];
  if (pkgs && pkgs.length > 0) {
    const entries = displayEntries(pkgs);
    const shown = entries.slice(0, 10);
    pkgLines = shown.map(pkgLine);
    if (entries.length > 10) pkgLines.push('#', `# And ${entries.length - 10} more ...`);
  } else {
    pkgLines = ['# (failed to load package list)'];
  }

  const text = [
    '######################################################################',
    '#                 _   ___ _____   ___                                #',
    '#                /_\\ | _ \\_   _| | _ \\___ _ __  ___                  #',
    '#               / _ \\|  _/ | |   |   / -_) \'_ \\/ _ \\                 #',
    '#              /_/ \\_\\_|   |_|   |_|_\\___| .__/\\___/                 #',
    `#                by ${author}|_|${' '.repeat(Math.max(0, 29 - author.length))}#`,
    '#                                                                    #',
    '#               Personal APT repository for software                 #',
    '#                    unavailable or outdated in                      #',
    '#                   standard Ubuntu repos                            #',
    '#                                                                    #',
    '######################################################################',
    '#', '# Apps already in this repo:', '#',
    ...pkgLines,
    '#', '# If you want to use this repo, just add it to your APT sources:', '#',
    `sudo curl -fsSL ${fallbackOrigin}/apt-key.asc \\`,
    '  -o /etc/apt/keyrings/daydve-apt-repo.asc && \\',
    'echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/daydve-apt-repo.asc] \\',
    `  ${fallbackOrigin} noble main" \\`,
    '  | sudo tee /etc/apt/sources.list.d/daydve-apt-repo.list && \\',
    'sudo apt update', '',
  ].join('\n');

  return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

// ── Homepage ──

async function serveHome(url: URL, ctx: ExecutionContext, env: Env): Promise<Response> {
  const packagesUrl = `${repoOrigin(env.REPO)}/packages.json`;
  const pkgs = await fetchJSON(packagesUrl, 'https://_cache/packages-' + env.CACHE_BUST, ctx) as Package[] | null;
  const { aptOrigin, fallbackOrigin } = getOrigins(env);
  const pkgCount = pkgs ? pkgs.length : 0;

  const safeAptOrigin = escapeHtml(aptOrigin);
  const safeFallback = escapeHtml(fallbackOrigin);

  const manualPrimary = `sudo curl -fsSL ${safeFallback}/apt-key.asc \\
  -o /etc/apt/keyrings/daydve-apt-repo.asc && \\
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/daydve-apt-repo.asc] \\
  ${safeFallback} noble main" \\
  | sudo tee /etc/apt/sources.list.d/daydve-apt-repo.list && \\
sudo apt update`;

  const pkgCards = (pkgs || []).slice(0, 12).map(p => {
    const safeName = escapeHtml(p.name);
    const safeDesc = escapeHtml(p.description);
    const iconUrl = p.icon ? `${safeAptOrigin}${escapeHtml(p.icon)}` : '';
    const iconHtml = iconUrl
      ? `<img class="store-icon" src="${iconUrl}" alt="${safeName}" width="44" height="44" loading="lazy" onerror="this.style.display='none'">`
      : `<div class="store-ph">${iconPackage(20)}</div>`;
    const familyTag = p.group ? ` <span class="family-badge">${escapeHtml(p.group)}</span>` : '';

    return `<a href="/packages/${safeName}" class="store-card">
  <div class="store-icon-wrap">${iconHtml}</div>
  <div class="store-info">
    <div class="store-name">${safeName}${familyTag}</div>
    <div class="store-desc">${safeDesc}</div>
  </div>
</a>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
${sharedHead(env.SITE_NAME || 'apt-repo', `${env.SITE_NAME || 'apt-repo'} for Ubuntu — ${pkgCount} packages`, `
.store-grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(260px, 1fr));gap:0.65rem}
.store-card{display:flex;align-items:center;gap:0.75rem;padding:0.65rem 0.8rem;background:var(--bg-surface);border:1px solid var(--border-muted);border-radius:var(--radius-md);text-decoration:none;color:var(--text-primary);transition:all var(--transition)}
.store-card:hover{border-color:var(--accent);background:var(--bg-surface-hover);text-decoration:none}
.store-icon-wrap{flex-shrink:0;width:44px;height:44px;display:flex;align-items:center;justify-content:center}
.store-icon{width:44px;height:44px;border-radius:var(--radius-md);object-fit:contain;background:var(--bg-body);border:1px solid var(--border-muted);display:block}
.store-ph{width:44px;height:44px;border-radius:var(--radius-md);background:var(--bg-surface);border:1px solid var(--border-muted);display:flex;align-items:center;justify-content:center;color:var(--text-secondary)}
.store-info{flex:1;min-width:0}
.store-name{font-weight:600;font-size:0.9rem;line-height:1.3;margin-bottom:0.1rem}
.store-desc{font-size:0.78rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tab-p{display:none}
.tab-p.active{display:block}
.browse-btn{display:inline-flex;align-items:center;gap:0.4rem;margin-top:0.85rem;color:var(--accent);font-size:0.88rem}
.browse-btn:hover{text-decoration:underline}
`)}
</head>
<body>
${sharedHeader(env.SITE_NAME || 'apt-repo', env.REPO, 'home', env.TELEGRAM)}

<main>
  <section class="sec">
    <div class="sec-head">
      <div class="sec-title">Add repository</div>
    </div>

    <div class="tab-h">
      <button class="tab-b active" onclick="showTab(this,'t1')">curl | bash</button>
      <button class="tab-b" onclick="showTab(this,'t2')">Manual</button>
    </div>

    <div class="tab-p active" id="t1">
      <div class="term-box">
        <div class="term-header">
          <div class="term-title">bash</div>
          <button class="copy-btn" onclick="copyCmd(this,'curl -fsSL ${safeAptOrigin} | sudo bash')" aria-label="Copy command">
            ${iconCopy(13)}${iconCheck(13)}<span class="copy-text">Copy</span>
          </button>
        </div>
        <div class="term-body">
          <pre><code><span class="hl-cmd">curl</span> <span class="hl-flag">-fsSL</span> <span class="hl-str">${safeAptOrigin}</span> <span class="hl-pipe">|</span> <span class="hl-cmd">sudo bash</span></code></pre>
        </div>
      </div>

      <div class="note">If <code style="color:var(--text-primary)">${safeAptOrigin}</code> triggers a Cloudflare captcha in terminal, use the fallback mirror:</div>
      <div class="term-box">
        <div class="term-header">
          <div class="term-title">bash (fallback)</div>
          <button class="copy-btn" onclick="copyCmd(this,'curl -fsSL ${safeFallback} | sudo bash')" aria-label="Copy fallback command">
            ${iconCopy(13)}${iconCheck(13)}<span class="copy-text">Copy</span>
          </button>
        </div>
        <div class="term-body">
          <pre><code><span class="hl-cmd">curl</span> <span class="hl-flag">-fsSL</span> <span class="hl-str">${safeFallback}</span> <span class="hl-pipe">|</span> <span class="hl-cmd">sudo bash</span></code></pre>
        </div>
      </div>
    </div>

    <div class="tab-p" id="t2">
      <div class="term-box">
        <div class="term-header">
          <div class="term-title">bash</div>
          <button class="copy-btn" onclick="copyCmd(this,'${manualPrimary.replace(/'/g, "\\'").replace(/\n/g, '\\n')}')" aria-label="Copy manual steps">
            ${iconCopy(13)}${iconCheck(13)}<span class="copy-text">Copy</span>
          </button>
        </div>
        <div class="term-body">
          <pre><code><span class="hl-cmd">sudo curl</span> <span class="hl-flag">-fsSL</span> <span class="hl-str">${safeFallback}/apt-key.asc</span> <span class="hl-pipe">\\</span>
  <span class="hl-flag">-o</span> <span class="hl-path">/etc/apt/keyrings/daydve-apt-repo.asc</span> <span class="hl-pipe">&amp;&amp; \\</span>
<span class="hl-cmd">echo</span> <span class="hl-str">&quot;deb <span class="hl-opt">[arch=amd64 signed-by=/etc/apt/keyrings/daydve-apt-repo.asc]</span> \\
  ${safeFallback} noble main&quot;</span> <span class="hl-pipe">\\</span>
  <span class="hl-pipe">|</span> <span class="hl-cmd">sudo tee</span> <span class="hl-path">/etc/apt/sources.list.d/daydve-apt-repo.list</span> <span class="hl-pipe">&amp;&amp; \\</span>
<span class="hl-cmd">sudo apt</span> <span class="hl-arg">update</span></code></pre>
        </div>
      </div>
    </div>
  </section>

  <section class="sec">
    <div class="sec-head">
      <div class="sec-title">Packages <span class="sec-badge">${pkgCount}</span></div>
    </div>
    <div class="store-grid">${pkgCards}</div>
    <div>
      <a href="/packages" class="browse-btn">View all ${pkgCount} packages →</a>
    </div>
  </section>
</main>

${sharedFooter(env.REPO, env.TELEGRAM)}
<script>
${sharedScript()}
function showTab(btn,id){
  document.querySelectorAll('.tab-b').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.tab-p').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(id).classList.add('active');
}
</script>
</body>
</html>`;

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

// ── Package list ──

async function servePackageList(url: URL, ctx: ExecutionContext, env: Env): Promise<Response> {
  const packagesUrl = `${repoOrigin(env.REPO)}/packages.json`;
  const pkgs = await fetchJSON(packagesUrl, 'https://_cache/packages-' + env.CACHE_BUST, ctx) as Package[] | null;
  const { aptOrigin } = getOrigins(env);
  const pkgCount = pkgs ? pkgs.length : 0;

  const allCats = new Set<string>();
  for (const p of pkgs || []) for (const c of p.categories || []) allCats.add(c);
  const sortedCats = [...allCats].sort();
  const catBtns = sortedCats.map(c => `<button class="filter-pill" data-cat="${escapeHtml(c)}" onclick="filterCat('${escapeHtml(c)}')">${escapeHtml(catLabel(c))}</button>`).join('');

  const groupCats = new Map<string, string[]>();
  for (const p of pkgs || []) {
    if (p.group && !groupCats.has(p.group) && (p.categories || []).length > 0) groupCats.set(p.group, p.categories || []);
  }

  const rows = (pkgs || []).map(p => {
    const safeName = escapeHtml(p.name);
    const safeDesc = escapeHtml(p.description);
    const effectiveCats = p.group ? [...new Set([...(p.categories || []), ...(groupCats.get(p.group) || [])])] : (p.categories || []);
    const catsHtml = effectiveCats.map(c => `<span class="tag">${escapeHtml(catLabel(c))}</span>`).join(' ');
    const iconUrl = p.icon ? `${aptOrigin}${escapeHtml(p.icon)}` : '';
    const iconHtml = iconUrl
      ? `<img class="prow-icon" src="${iconUrl}" alt="${safeName}" width="34" height="34" loading="lazy" onerror="this.style.display='none'">`
      : `<div class="prow-ph">${iconPackage(18)}</div>`;
    const familyTag = p.group ? ` <span style="font-size:0.75rem;color:var(--accent)">${escapeHtml(p.group)}</span>` : '';

    return `<a class="prow" href="/packages/${safeName}" data-cats="${escapeHtml(effectiveCats.join(','))}">
  <div class="prow-icon-wrap">${iconHtml}</div>
  <div class="prow-main">
    <div class="prow-name">${safeName}${familyTag}</div>
    <div class="prow-desc">${safeDesc}</div>
  </div>
  <div class="prow-tags">${catsHtml}</div>
</a>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
${sharedHead(`${env.SITE_NAME || 'apt-repo'} — Packages`, `Browse ${pkgCount} packages available in the repository`, `
.prow{display:flex;align-items:center;gap:0.7rem;padding:0.45rem 0.75rem;border:1px solid transparent;border-radius:var(--radius-md);text-decoration:none;color:var(--text-primary);transition:border-color var(--transition)}
.prow:hover{border-color:var(--border);background:var(--bg-surface);text-decoration:none}
.prow.hidden{display:none}
.prow-icon-wrap{flex-shrink:0;width:34px;height:34px;display:flex;align-items:center;justify-content:center}
.prow-icon{width:34px;height:34px;border-radius:var(--radius-md);object-fit:contain;background:var(--bg-body);border:1px solid var(--border-muted);display:block}
.prow-ph{width:34px;height:34px;border-radius:var(--radius-md);background:var(--bg-surface);border:1px solid var(--border-muted);display:flex;align-items:center;justify-content:center;color:var(--text-secondary)}
.prow-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:0.1rem}
.prow-name{font-weight:600;font-size:0.88rem}
.prow-desc{font-size:0.78rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.prow-tags{display:flex;flex-wrap:wrap;gap:0.3rem;flex-shrink:0}
.plist{display:flex;flex-direction:column;gap:0.15rem}
.toolbar{display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;margin-bottom:0.8rem}
.search-input{flex:1;min-width:180px;padding:0.45rem 0.65rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);font-family:inherit;font-size:0.85rem;outline:none}
.search-input:focus{border-color:var(--accent)}
.search-input::placeholder{color:var(--text-muted)}
.filter-pill{padding:0.2rem 0.55rem;background:none;border:1px solid var(--border);border-radius:var(--radius-full);color:var(--text-secondary);font-family:inherit;font-size:0.75rem;cursor:pointer;transition:all var(--transition)}
.filter-pill:hover{border-color:var(--accent);color:var(--accent)}
.filter-pill.active{background:var(--accent-btn);border-color:var(--accent-btn);color:#fff}
.count{color:var(--text-secondary);font-size:0.8rem;margin-left:auto}
.empty-state{text-align:center;padding:2rem;color:var(--text-secondary);font-size:0.9rem}
@media(max-width:600px){.prow-tags{display:none}}
`)}
</head>
<body>
${sharedHeader(env.SITE_NAME || 'apt-repo', env.REPO, 'packages', env.TELEGRAM)}

<main>
  <div class="toolbar">
    <input type="text" class="search-input" placeholder="Search packages..." oninput="filterAll()" id="search" autocomplete="off" spellcheck="false">
    <button class="filter-pill active" data-cat="all" onclick="filterCat('all')">All</button>
    ${catBtns}
    <span class="count" id="count">${pkgCount}</span>
  </div>

  <div class="plist" id="plist">${rows}</div>
  <div class="empty-state" id="empty" style="display:none">No packages match.</div>
</main>

${sharedFooter(env.REPO, env.TELEGRAM)}
<script>
let activeCat = 'all';
function filterCat(c){
  activeCat = c;
  document.querySelectorAll('.filter-pill').forEach(b => b.classList.toggle('active', b.dataset.cat === c));
  filterAll();
}
function filterAll(){
  const q = document.getElementById('search').value.toLowerCase().trim();
  let v = 0;
  document.querySelectorAll('.prow').forEach(r => {
    const cats = (r.dataset.cats || '').split(',');
    const text = r.textContent.toLowerCase();
    const matchQuery = !q || text.includes(q);
    const matchCat = activeCat === 'all' || cats.includes(activeCat);
    const visible = matchQuery && matchCat;
    r.classList.toggle('hidden', !visible);
    if(visible) v++;
  });
  document.getElementById('count').textContent = v + '';
  document.getElementById('empty').style.display = v === 0 ? 'block' : 'none';
}
</script>
</body>
</html>`;

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

// ── Package detail ──

async function servePackageDetail(name: string, url: URL, ctx: ExecutionContext, env: Env): Promise<Response> {
  const packagesUrl = `${repoOrigin(env.REPO)}/packages.json`;
  const pkgs = await fetchJSON(packagesUrl, 'https://_cache/packages-' + env.CACHE_BUST, ctx) as Package[] | null;
  if (!pkgs) return new Response('Package data unavailable', { status: 502 });

  const pkg = pkgs.find(p => p.name === name);
  if (!pkg) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });

  const { aptOrigin } = getOrigins(env);
  const safeName = escapeHtml(pkg.name);
  const safeDesc = escapeHtml(pkg.description);
  const safeSource = escapeHtml(pkg.source || '');
  const installCmd = `sudo apt install ${pkg.name}`;
  const aptLink = `apt://${pkg.name}`;
  const longDesc = pkg.longDescription ? escapeHtml(pkg.longDescription) : safeDesc;

  const iconUrl = pkg.icon ? `${aptOrigin}${escapeHtml(pkg.icon)}` : '';
  const iconHtml = iconUrl
    ? `<img class="detail-icon" src="${iconUrl}" alt="${safeName}" width="72" height="72" onerror="this.style.display='none'">`
    : `<div class="detail-ph">${iconPackage(32)}</div>`;

  let familyHtml = '';
  if (pkg.group) {
    const members = pkgs.filter(p => p.group === pkg.group);
    if (members.length > 1) {
      const links = members.filter(m => m.name !== pkg.name).map(m => `<a href="/packages/${escapeHtml(m.name)}">${escapeHtml(m.name)}</a>`).join(' · ');
      if (links) familyHtml = `<div style="font-size:0.8rem;color:var(--accent);margin-top:0.3rem">Part of <strong>${escapeHtml(pkg.group)}</strong>: ${links}</div>`;
    }
  }

  const screenshots = pkg.screenshots || [];
  const ssHtml = screenshots.length > 1 ? `
<div class="sec">
  <div class="gallery">
    <button class="gallery-nav prev" onclick="ssSlide(-1)" aria-label="Previous screenshot">${iconChevronLeft(20)}</button>
    <div class="gallery-track" id="ss-track">
      ${screenshots.map(s => `<div class="gallery-slide"><img src="${escapeHtml(s)}" alt="${safeName} screenshot" loading="lazy" onclick="openLb(this.src)"></div>`).join('')}
    </div>
    <button class="gallery-nav next" onclick="ssSlide(1)" aria-label="Next screenshot">${iconChevronRight(20)}</button>
  </div>
  <div class="gallery-dots" id="ss-dots">${screenshots.map((_, i) => `<button class="gallery-dot${i === 0 ? ' active' : ''}" onclick="ssGo(${i})" aria-label="Slide ${i + 1}"></button>`).join('')}</div>
</div>` : screenshots.length === 1 ? `
<div class="sec">
  <div class="single-screenshot">
    <img src="${escapeHtml(screenshots[0])}" alt="${safeName} screenshot" onclick="openLb(this.src)">
  </div>
</div>` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
${sharedHead(`${pkg.name} — ${env.SITE_NAME || 'apt-repo'}`, safeDesc, `
.back-link{display:inline-block;margin-bottom:1rem;color:var(--text-secondary);font-size:0.85rem}
.back-link:hover{color:var(--accent);text-decoration:underline}
.dtop{display:flex;align-items:flex-start;gap:1rem;margin-bottom:1.2rem}
.detail-icon-wrap{flex-shrink:0;width:72px;height:72px;display:flex;align-items:center;justify-content:center}
.detail-icon{width:72px;height:72px;border-radius:var(--radius-md);object-fit:contain;background:var(--bg-body);border:1px solid var(--border-muted);display:block}
.detail-ph{width:72px;height:72px;border-radius:var(--radius-md);background:var(--bg-surface);border:1px solid var(--border-muted);display:flex;align-items:center;justify-content:center;color:var(--text-secondary)}
.dtop h1{font-size:1.3rem;font-weight:700}
.ddesc{color:var(--text-secondary);font-size:0.9rem}
.dlong{color:var(--text-primary);font-size:0.9rem;line-height:1.8}
.dlinks{display:flex;flex-wrap:wrap;gap:0.5rem;margin:0.6rem 0}
.dlinks a{padding:0.35rem 0.7rem;border:1px solid var(--border);border-radius:var(--radius-md);font-size:0.82rem;color:var(--accent);transition:all var(--transition)}
.dlinks a:hover{border-color:var(--accent);background:var(--bg-surface);text-decoration:none}
.dlinks a.primary{background:var(--accent-btn);border-color:var(--accent-btn);color:#fff}
.gallery{position:relative;overflow:hidden;border-radius:var(--radius-md)}
.gallery-track{display:flex;transition:transform 0.25s ease}
.gallery-slide{min-width:100%;display:flex;align-items:center;justify-content:center}
.gallery-slide img{width:100%;max-height:400px;object-fit:contain;border-radius:var(--radius-md);cursor:pointer}
.single-screenshot{display:flex;align-items:center;justify-content:center}
.single-screenshot img{width:100%;max-height:400px;object-fit:contain;border-radius:var(--radius-md);cursor:pointer}
.gallery-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(22,27,34,0.85);border:1px solid var(--border);color:var(--text-primary);width:34px;height:34px;border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all var(--transition);z-index:2}
.gallery-nav:hover{background:var(--bg-surface-hover);border-color:var(--accent)}
.gallery-nav.prev{left:0.5rem}
.gallery-nav.next{right:0.5rem}
.gallery-dots{display:flex;justify-content:center;gap:0.35rem;margin-top:0.5rem}
.gallery-dot{width:8px;height:8px;border-radius:50%;background:var(--border);border:none;cursor:pointer;padding:0;transition:all var(--transition)}
.gallery-dot.active{background:var(--accent)}
.lb{display:none;position:fixed;inset:0;z-index:200;background:rgba(0,0,0,0.9);align-items:center;justify-content:center;padding:1rem}
.lb.open{display:flex}
.lb img{max-width:90vw;max-height:88vh;object-fit:contain;border-radius:var(--radius-sm)}
.lb-btn{position:absolute;background:rgba(22,27,34,0.85);border:1px solid var(--border);color:var(--text-primary);border-radius:var(--radius-sm);width:40px;height:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all var(--transition)}
.lb-btn:hover{background:var(--accent-btn);border-color:var(--accent-btn)}
.lb-close{top:1rem;right:1rem}
.lb-prev{left:1rem;top:50%;transform:translateY(-50%)}
.lb-next{right:1rem;top:50%;transform:translateY(-50%)}
@media(max-width:600px){
  .dtop{flex-direction:column;align-items:center;text-align:center}
  .dlinks{justify-content:center}
}
`)}
</head>
<body>
<a href="/packages" class="back-link">&larr; All packages</a>

<main>
  <div class="dtop">
    <div class="detail-icon-wrap">${iconHtml}</div>
    <div>
      <h1>${safeSource ? `<a href="${safeSource}" target="_blank" rel="noopener">${safeName}</a>` : safeName}</h1>
      <p class="ddesc">${safeDesc}</p>
      ${familyHtml}
    </div>
  </div>

  ${ssHtml}

  <div class="sec">
    <div class="sec-title">About</div>
    <div class="dlong">${longDesc.replace(/\n/g, '<br>')}</div>
  </div>

  <div class="sec">
    <div class="sec-title">Install</div>
    <div class="dlinks">
      <a href="${escapeHtml(aptLink)}" class="primary">Install via package manager</a>
      ${safeSource ? `<a href="${safeSource}" target="_blank" rel="noopener">Homepage</a>` : ''}
    </div>
    <div class="term-box">
      <div class="term-header">
        <div class="term-title">apt install</div>
        <button class="copy-btn" onclick="copyCmd(this,'${escapeHtml(installCmd)}')" aria-label="Copy install command">
          ${iconCopy(13)}${iconCheck(13)}<span class="copy-text">Copy</span>
        </button>
      </div>
      <div class="term-body">
        <pre><code><span class="hl-cmd">sudo apt</span> <span class="hl-arg">install</span> <span class="hl-str">${safeName}</span></code></pre>
      </div>
    </div>
  </div>
</main>

${sharedFooter(env.REPO, env.TELEGRAM)}

<div class="lb" id="lb" onclick="closeLb()">
  <button class="lb-btn lb-close" onclick="closeLb()" aria-label="Close">${iconClose(20)}</button>
  <button class="lb-btn lb-prev" onclick="event.stopPropagation();lbSlide(-1)" aria-label="Previous">${iconChevronLeft(20)}</button>
  <button class="lb-btn lb-next" onclick="event.stopPropagation();lbSlide(1)" aria-label="Next">${iconChevronRight(20)}</button>
  <img id="lb-img" src="" alt="Screenshot preview" onclick="event.stopPropagation()">
</div>

<script>
${sharedScript()}
let ssIdx = 0;
const ssTotal = ${screenshots.length};
function ssGo(i){
  if(ssTotal <= 1) return;
  ssIdx = ((i % ssTotal) + ssTotal) % ssTotal;
  const track = document.getElementById('ss-track');
  if(track) track.style.transform = 'translateX(-' + (ssIdx * 100) + '%)';
  document.querySelectorAll('.gallery-dot').forEach((d, j) => d.classList.toggle('active', j === ssIdx));
}
function ssSlide(d){ ssGo(ssIdx + d); }
function openLb(src){
  const imgs = document.querySelectorAll('.gallery-slide img, .single-screenshot img');
  ssIdx = [...imgs].findIndex(i => i.src === src);
  if(ssIdx === -1) ssIdx = 0;
  document.getElementById('lb-img').src = src;
  document.getElementById('lb').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeLb(){
  document.getElementById('lb').classList.remove('open');
  document.body.style.overflow = '';
}
function lbSlide(d){
  const imgs = document.querySelectorAll('.gallery-slide img, .single-screenshot img');
  if(imgs.length === 0) return;
  ssIdx = ((ssIdx + d) % imgs.length + imgs.length) % imgs.length;
  document.getElementById('lb-img').src = imgs[ssIdx].src;
}
document.addEventListener('keydown', e => {
  const open = document.getElementById('lb').classList.contains('open');
  if(!open) return;
  if(e.key === 'Escape') closeLb();
  if(e.key === 'ArrowLeft') lbSlide(-1);
  if(e.key === 'ArrowRight') lbSlide(1);
});
</script>
</body>
</html>`;

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
