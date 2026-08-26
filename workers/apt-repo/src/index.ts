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
  /** Custom domain serving the repo, e.g. https://apt.example.com */
  APT_ORIGIN?: string;
  /** Fallback mirror on *.workers.dev; derived from AUTHOR when unset */
  APT_FALLBACK?: string;
}

interface Package {
  name: string;
  description: string;
  source: string;
  version?: string;
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
      return isBrowser ? serveHome(ctx, env) : serveText(ctx, env);
    }

    if (path === '/packages' || path === '/packages/') {
      return servePackageList(ctx, env);
    }

    if (path === '/about') {
      return serveAbout(env);
    }

    const pkgMatch = path.match(/^\/packages\/([^/]+)$/);
    if (pkgMatch) {
      return servePackageDetail(pkgMatch[1], ctx, env);
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
      return proxy(`${repoOrigin(env.REPO)}${path}`, { contentType: 'image/png', cache: true });
    }

    if (path.startsWith('/screenshots/')) {
      return proxy(`${repoOrigin(env.REPO)}${path}`, { cache: true });
    }

    return isBrowser ? serveNotFound(env) : new Response('Not found', { status: 404 });
  },
};

async function proxy(url: string, opts: { contentType?: string; cache?: boolean } = {}): Promise<Response> {
  const cf: Record<string, unknown> = opts.cache
    ? { cacheTtl: 604800, cacheEverything: true } // icons/screenshots are immutable per filename
    : { cacheTtl: -1 }; // apt metadata must stay fresh
  const resp = await fetch(url, { cf } as any);
  const headers: Record<string, string> = {
    'content-type': opts.contentType || resp.headers.get('content-type') || 'application/octet-stream',
    'cache-control': opts.cache ? 'public, max-age=604800' : 'no-store, no-cache, must-revalidate',
  };
  if (!opts.cache) {
    headers['content-length'] = resp.headers.get('content-length') || '';
    headers['last-modified'] = resp.headers.get('last-modified') || '';
  }
  return new Response(resp.body, { status: resp.status, headers });
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

async function loadPackages(env: Env, ctx: ExecutionContext): Promise<Package[] | null> {
  return fetchJSON(
    `${repoOrigin(env.REPO)}/packages.json`,
    'https://_cache/packages-' + env.CACHE_BUST,
    ctx,
  ) as Promise<Package[] | null>;
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
  const fallbackOrigin = env.APT_FALLBACK
    || (env.AUTHOR ? `https://apt-repo.${env.AUTHOR.toLowerCase()}.workers.dev` : '');
  const aptOrigin = env.APT_ORIGIN || fallbackOrigin;
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

const ICON_PATHS: Record<string, string> = {
  package: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronDown: '<polyline points="6 9 12 15 18 9"/>',
  close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
};

// Inline SVG favicon — white cat on dark background, provided by repo author
const FAVICON = "data:image/svg+xml,%3Csvg%20width%3D%2264%22%20height%3D%2264%22%20viewBox%3D%220%200%2032%2032%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%2232%22%20height%3D%2232%22%20rx%3D%226%22%20fill%3D%22%230d1117%22%2F%3E%3Cg%20transform%3D%22matrix%28.98992%200%200%20.98992%20-.14983%20.16241%29%22%20stroke-width%3D%22.090439%22%3E%3Cpath%20d%3D%22m12.198%201.3055e-5c-1.0585%200.2578-1.4794%202.1527-2.0163%203.2393-1.4879%203.4579-3.58%206.709-6.471%209.1563-2.672%203.2132-1.8733%208.8868%201.925%2010.886%201.9981%201.082%204.4854%200.45728%206.4263%201.728%201.3979%200.64937%201.4993%202.3039%202.3545%203.4023%201.7401%202.1824%204.5269%203.4961%207.3032%203.5866%201.4248%200.27069%202.006-1.4171%200.5191-1.8043-1.3248-1.5312-3.8379-1.2321-4.9847-2.9702-0.54139-1.2242-1.685-3.1862-1.7811-3.9383%201.4818-0.17487%203.2469-0.90594%204.5463%200.12845%200.81086%200.44965%202.9992-0.91331%204.0822%200.10666%200.7527%200.46214%201.2664%200.08986%202.0413%200.19423%200.0476-0.78099%201.2598-0.56258%200.9904-1.5451%201.1303-0.34336%203.3673-0.28737%203.3193-1.7361-0.21264-1.3714-2.6939-0.6793-3.8758-0.62718-1.4453%200.58111-2.9513%200.27572-3.4841-1.3364-1.8068-3.13-1.6574-7.0652-3.8162-10.019-1.7925-2.2798-5.1349-2.4937-7.72-1.8401%200.34207-0.6968%201.2233-2.4295%201.7866-3.4724%200.84311-1.0364%200.61812-2.7946-0.69425-2.7746%200.006889-0.10435-0.19874-0.40674-0.4508-0.36475zm0.48701%206.4574c-0.96582%200.09636-0.62882%200.043798%200%200z%22%20fill%3D%22%23fff%22%2F%3E%3Cpath%20d%3D%22m12.275-0.16406c-1.543%200.3203-1.6355%202.3216-2.335%203.4936-1.4698%203.3861-3.5423%206.5555-6.374%208.9551-2.7494%203.296-1.9081%209.1113%201.9892%2011.157%202.0487%201.1168%204.6317%200.4528%206.5907%201.8327%201.3659%200.7779%201.3255%202.5635%202.4019%203.5955%201.8731%202.0584%204.6784%203.3556%207.4736%203.2892%200.6832-0.06659%201.5582-0.5497%201.3211-1.3309-1.0117-0.84733-2.039-1.8173-3.3811-2.1208-1.2085-0.40284-2.5424-1.0064-2.9517-2.3287-0.23053-0.94738-1.3424-2.4057-1.2633-2.9601%201.2611-0.2318%202.6848-0.56055%203.8763-0.16522%201.569%201.0127%203.533-0.50178%204.8867%200.68745%200.65738-0.19422%202.2258%200.7077%202.1074-0.62891%200.83271-0.30444%200.57945-1.5132%201.7754-1.2324%201.4905%200.26941%203.349-1.8587%201.5192-2.5554-1.7017-0.26102-3.4584%200.09118-5.1285%200.4441-1.3262-0.52421-1.769-2.1238-2.3216-3.3286-1.1393-2.8987-1.237-6.334-3.4216-8.7316-1.8657-1.7308-4.6659-1.9646-7.0831-1.6584%200.63365-1.6051%201.8148-2.9978%202.1504-4.7109-0.15208-1.018-1.1048-1.2434-1.832-1.7031zm-0.07227%200.51074c0.79609%200.26585%201.7075%201.0135%201.0212%201.9338-0.62156%201.4175-1.6372%202.7837-1.7135%204.3563%201.1214-0.00744%202.3911-0.1054%203.5554%200.098251%201.663%200.17656%203.451%200.81523%204.2349%202.416%201.8647%203.1244%201.3346%207.2061%203.7167%2010.074-1.5655-0.48768-2.9857-1.6907-3.2317-3.2693-0.82184%201.6232%201.2938%203.1328%202.7246%203.6079%201.4245%200.76473%203.5734%200.94144%204.2481%202.6152%200.28298%200.82607-0.79596%200.78668-0.82496%201.431-1.0308-0.12481-2.008-0.34319-2.7053-1.3287-2.032-1.9282-5.2366-1.9544-7.0818-4.1556%201.3389-0.48429%202.6265-1.8326%202.7016-3.4031-0.32332-0.94657%201.4828-2.3986%200.34918-3.0071-0.70517%200.42512-2.5909-1.5917-1.7452-0.02206%200.62924%200.76899%202.2395%200.12812%201.2549%201.4439-0.38682%200.50447-2.5496%201.4195-1.0469%201.8379%200.53806-0.42228%200.86195-1.6203%200.68276-0.23917-0.40771%201.8135-2.1659%202.8857-3.8214%203.4071-0.67008%200.6861-3.1383%200.92951-1.9277-0.48833-0.51222-0.24661-2.4988-1.4804-1.4766-0.05269%200.82429%200.09127%200.80918%200.5148%200.59766%201.0801-1.4273-0.61262-1.7149-2.3284-2.3888-3.6131-0.26752-1.1036-0.10461-2.3531%200.40621-3.3401-0.15785-1.3402%200.40503-3.0076%200.23047-4.1249-0.86945%200.75867-0.6697%202.1235-0.64843%203.1758%200.20339%201.4354-1.1821%202.7283-0.58551%204.2418%200.052373%201.2621%201.5226%201.8277%201.3754%203.0919%200.41553%200.93734%201.7363%200.63668%200.86994%201.7829%200.19408%201.2746%201.7204%200.52747%202.2835%201.4401%201.343%200.28086%201.4766-1.6081%200.58398-2.2324%200.89176-0.3458%202.01-1.5683%202.4916-0.10724%201.4642%201.4175%203.6885%201.4463%205.2516%202.7314%200.70005%200.51474%202.0874%201.3584%200.42225%201.2824-0.74338%200.12024-2.0261%200.21655-2.3783-0.20738-1.5123-0.58458-3.3821%200.12052-4.674-0.06628-0.98125-1.0432-3.1031-2.579-4.2909-1.9236%201.7201%200.49955%203.3531%201.5218%204.2453%203.1333%201.0272%201.712%201.5661%203.8805%203.442%204.9149%201.3268%200.97235%203.0021%201.2698%204.3811%202.1214-0.23554%201.254-2.4444%200.3434-3.3516-0.01754-2.2021-0.84467-4.8309-1.9205-5.6229-4.3626-0.54504-1.7165-2.2274-2.8476-4.0061-2.8475-1.7975-0.003585-3.8499-0.15106-5.0586-1.6788-1.5227-1.9938-2.0219-4.6912-1.6875-7.1465%200.18009-1.4817%201.1568-2.6764%202.3446-3.5045%203.1559-2.7448%204.8338-6.6902%206.2332-10.53%200.14235-0.23438%200.31891-0.50932%200.61948-0.54813zm-0.76172%2010.849c-0.30305%200.24595-1.4035%201.5647-0.55079%201.4277%201.1172-1.6543%201.7558%200.4518%201.386%201.3821%201.9067-0.73831%200.50437-2.5012-0.83524-2.8098zm1.7734%207.8535c0.99521%200.36599%200.56428%202.5565-0.59191%201.289-1.2861%200.38218-1.4007-1.7263-0.13477-0.95898%200.26977-0.0078%200.57232-0.07951%200.72668-0.33zm-3.6641%200.50488c-0.58371%200.31615-0.097035%201.2854%200.45117%200.73538%200.29873-0.24358-0.16507-0.71602-0.45117-0.73538zm19.449%200.41504c1.543-0.23863%201.2255%201.7607-0.12659%201.5384-0.98593%200.1731-1.685%200.54012-2.1531-0.46127-0.5832-0.46613-1.8201-0.85187-0.38634-0.86324%200.88299-0.121%201.7727-0.23946%202.666-0.21392z%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E";

function icon(name: keyof typeof ICON_PATHS, size = 16, sw = 2, cls = ''): string {
  const c = cls ? ` class="${cls}"` : '';
  return `<svg${c} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name]}</svg>`;
}

function sharedHead(title: string, desc: string, extraCss: string = '', ogImage?: string): string {
  const ogImageTags = ogImage
    ? `<meta property="og:image" content="${escapeHtml(ogImage)}">
<meta name="twitter:card" content="summary_large_image">`
    : '<meta name="twitter:card" content="summary">';
  return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="icon" href="${FAVICON}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
${ogImageTags}
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
  --text-muted: #7d8590;
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

function sharedHeader(siteName: string, repo: string, activePage: 'home' | 'packages' | 'about' = 'home', telegram?: string): string {
  const safeSite = escapeHtml(siteName || 'DayDve APT Repository');
  const isActive = (p: string) => activePage === p ? ' active' : '';

  return `<header class="site-header">
<h1 class="brand-title">${safeSite}</h1>
<p class="brand-sub">Software unavailable or outdated in standard repos</p>
<nav class="site-nav" aria-label="Main">
<a href="/" class="nav-link${isActive('home')}">Home</a>
<a href="/packages" class="nav-link${isActive('packages')}">Packages</a>
<a href="/about" class="nav-link${isActive('about')}">About</a>
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

// Delegated handlers shared by every page (no inline JS attributes):
// - hide broken <img> (capture phase: 'error' does not bubble)
// - [data-copy] triggers copy-to-clipboard with Copied! feedback
function sharedScript(): string {
  return `document.addEventListener('error',e=>{if(e.target instanceof HTMLImageElement)e.target.style.display='none'},true);
document.addEventListener('click',e=>{
  const t=e.target instanceof Element?e.target:null;if(!t)return;
  const c=t.closest('[data-copy]');if(!c)return;
  navigator.clipboard.writeText(c.dataset.copy||'').then(()=>{
    c.classList.add('copied');const l=c.querySelector('.copy-text');
    if(l)l.textContent='Copied!';
    setTimeout(()=>{c.classList.remove('copied');if(l)l.textContent='Copy'},2000);
  }).catch(()=>{});
});`;
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

async function serveText(ctx: ExecutionContext, env: Env): Promise<Response> {
  const { fallbackOrigin } = getOrigins(env);
  const author = env.AUTHOR || '';
  const pkgs = await loadPackages(env, ctx);

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

async function serveHome(ctx: ExecutionContext, env: Env): Promise<Response> {
  const pkgs = await loadPackages(env, ctx);
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
      ? `<img class="store-icon" src="${iconUrl}" alt="${safeName}" width="44" height="44" loading="lazy">`
      : `<div class="store-ph">${icon('package', 20)}</div>`;
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

    <div class="tab-h" role="tablist" aria-label="Setup method">
      <button class="tab-b active" role="tab" aria-selected="true" data-tab="t1">curl | bash</button>
      <button class="tab-b" role="tab" aria-selected="false" data-tab="t2">Manual</button>
    </div>

    <div class="tab-p active" id="t1" role="tabpanel">
      <div class="term-box">
        <div class="term-header">
          <div class="term-title">bash</div>
          <button class="copy-btn" data-copy="curl -fsSL ${safeAptOrigin} | sudo bash" aria-label="Copy command">
            ${icon('copy', 13, 2, 'icon-copy')}${icon('check', 13, 2.5, 'icon-check')}<span class="copy-text">Copy</span>
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
          <button class="copy-btn" data-copy="curl -fsSL ${safeFallback} | sudo bash" aria-label="Copy fallback command">
            ${icon('copy', 13, 2, 'icon-copy')}${icon('check', 13, 2.5, 'icon-check')}<span class="copy-text">Copy</span>
          </button>
        </div>
        <div class="term-body">
          <pre><code><span class="hl-cmd">curl</span> <span class="hl-flag">-fsSL</span> <span class="hl-str">${safeFallback}</span> <span class="hl-pipe">|</span> <span class="hl-cmd">sudo bash</span></code></pre>
        </div>
      </div>
    </div>

    <div class="tab-p" id="t2" role="tabpanel">
      <div class="term-box">
        <div class="term-header">
          <div class="term-title">bash</div>
          <button class="copy-btn" data-copy="${escapeHtml(manualPrimary)}" aria-label="Copy manual steps">
            ${icon('copy', 13, 2, 'icon-copy')}${icon('check', 13, 2.5, 'icon-check')}<span class="copy-text">Copy</span>
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
    ${pkgCount > 0 ? `
    <div>
      <a href="/packages" class="browse-btn">View all ${pkgCount} packages →</a>
    </div>` : pkgs === null ? `
    <div class="note">Package list is temporarily unavailable.</div>` : ''}
  </section>
</main>

${sharedFooter(env.REPO, env.TELEGRAM)}
<script>
${sharedScript()}
document.addEventListener('click',e=>{
  const b=e.target instanceof Element?e.target.closest('.tab-b'):null;if(!b)return;
  document.querySelectorAll('.tab-b').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-selected',x===b?'true':'false')});
  document.querySelectorAll('.tab-p').forEach(p=>p.classList.toggle('active',p.id===b.dataset.tab));
});
</script>
</body>
</html>`;

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

// ── Package list ──

async function servePackageList(ctx: ExecutionContext, env: Env): Promise<Response> {
  const pkgs = await loadPackages(env, ctx);
  const { aptOrigin } = getOrigins(env);
  const pkgCount = pkgs ? pkgs.length : 0;

  const allCats = new Set<string>();
  for (const p of pkgs || []) for (const c of p.categories || []) allCats.add(c);
  const sortedCats = [...allCats].sort();
  const catBtns = sortedCats.map(c => `<button class="filter-pill" data-cat="${escapeHtml(c)}" aria-pressed="false">${escapeHtml(catLabel(c))}</button>`).join('');

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
      ? `<img class="prow-icon" src="${iconUrl}" alt="${safeName}" width="34" height="34" loading="lazy">`
      : `<div class="prow-ph">${icon('package', 18)}</div>`;
    const familyTag = p.group ? ` <span style="font-size:0.75rem;color:var(--accent)">${escapeHtml(p.group)}</span>` : '';

    return `<a class="prow" href="/packages/${safeName}" data-cats="${escapeHtml(effectiveCats.join(','))}">
  <div class="prow-icon-wrap">${iconHtml}</div>
  <div class="prow-main">
    <div class="prow-name">${safeName}${familyTag}${p.version ? ` <span class="prow-ver">${escapeHtml(p.version)}</span>` : ''}</div>
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
.prow-name{font-weight:600;font-size:0.88rem;display:flex;align-items:baseline;gap:0.4rem;min-width:0}
.prow-name > span:first-child{overflow:hidden;text-overflow:ellipsis}
.prow-ver{flex-shrink:1;font-family:var(--font-mono);font-size:0.72rem;color:var(--text-muted);font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
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
.filter-toggle svg{transition:transform var(--transition)}
.filter-toggle[aria-expanded="true"] svg{transform:rotate(180deg)}
.toolbar.filter-more{margin:-0.35rem 0 0.8rem}
.count{color:var(--text-secondary);font-size:0.8rem;margin-left:auto}
.empty-state{text-align:center;padding:2rem;color:var(--text-secondary);font-size:0.9rem}
@media(max-width:600px){.prow-tags{display:none}}
`)}
</head>
<body>
${sharedHeader(env.SITE_NAME || 'apt-repo', env.REPO, 'packages', env.TELEGRAM)}

<main>
  <div class="toolbar">
    <input type="search" class="search-input" id="search" placeholder="Search packages..." aria-label="Search packages" autocomplete="off" spellcheck="false">
    <button class="filter-pill active" data-cat="all" aria-pressed="true">All</button>
    <button class="filter-pill filter-toggle" id="filter-toggle" aria-expanded="false" aria-controls="filter-more">Filters ${icon('chevronDown', 12)}</button>
    <span class="count" id="count">${pkgCount}</span>
  </div>
  <div class="toolbar filter-more" id="filter-more" hidden>
    ${catBtns}
  </div>

  <div class="plist" id="plist">${rows}</div>
  <div class="empty-state" id="empty" style="display:${pkgs === null ? 'block' : 'none'}">${pkgs === null ? 'Package list is temporarily unavailable.' : 'No packages match.'}</div>
</main>

${sharedFooter(env.REPO, env.TELEGRAM)}
<script>
${sharedScript()}
let activeCat = 'all';
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
document.getElementById('search').addEventListener('input', filterAll);
document.addEventListener('click', e => {
  const t = e.target instanceof Element ? e.target : null; if(!t) return;
  if(t.closest('#filter-toggle')){
    const m = document.getElementById('filter-more');
    m.hidden = !m.hidden;
    document.getElementById('filter-toggle').setAttribute('aria-expanded', String(!m.hidden));
    return;
  }
  const pill = t.closest('[data-cat]'); if(!pill) return;
  activeCat = pill.dataset.cat;
  document.querySelectorAll('[data-cat]').forEach(b => {
    const on = b === pill;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  filterAll();
});
</script>
</body>
</html>`;

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

// ── Package detail ──

async function servePackageDetail(name: string, ctx: ExecutionContext, env: Env): Promise<Response> {
  const pkgs = await loadPackages(env, ctx);
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
    ? `<img class="detail-icon" src="${iconUrl}" alt="${safeName}" width="72" height="72">`
    : `<div class="detail-ph">${icon('package', 32)}</div>`;

  let familyHtml = '';
  if (pkg.group) {
    const members = pkgs.filter(p => p.group === pkg.group);
    if (members.length > 1) {
      const links = members.filter(m => m.name !== pkg.name).map(m => `<a href="/packages/${escapeHtml(m.name)}">${escapeHtml(m.name)}</a>`).join(' · ');
      if (links) familyHtml = `<div style="font-size:0.8rem;color:var(--accent);margin-top:0.3rem">Part of <strong>${escapeHtml(pkg.group)}</strong>: ${links}</div>`;
    }
  }

  const screenshots = pkg.screenshots || [];
  const ogImage = screenshots.length ? `${aptOrigin}${screenshots[0]}` : '';
  const ssHtml = screenshots.length > 1 ? `
<div class="sec">
  <div class="gallery">
    <button class="gallery-nav prev" data-action="ss-prev" aria-label="Previous screenshot">${icon('chevronLeft', 20, 2.5)}</button>
    <div class="gallery-track" id="ss-track">
      ${screenshots.map(s => `<div class="gallery-slide"><img class="ss-img" src="${escapeHtml(s)}" alt="${safeName} screenshot" loading="lazy"></div>`).join('')}
    </div>
    <button class="gallery-nav next" data-action="ss-next" aria-label="Next screenshot">${icon('chevronRight', 20, 2.5)}</button>
  </div>
  <div class="gallery-dots" id="ss-dots">${screenshots.map((_, i) => `<button class="gallery-dot${i === 0 ? ' active' : ''}" data-action="ss-go" data-index="${i}" aria-label="Slide ${i + 1}"></button>`).join('')}</div>
</div>` : screenshots.length === 1 ? `
<div class="sec">
  <div class="single-screenshot">
    <img class="ss-img" src="${escapeHtml(screenshots[0])}" alt="${safeName} screenshot">
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
.dver{font-family:var(--font-mono);font-size:0.78rem;color:var(--text-secondary);margin:0.1rem 0 0.15rem}
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
.ss-img{cursor:pointer}
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
`, ogImage)}
</head>
<body>
<a href="/packages" class="back-link">&larr; All packages</a>

<main>
  <div class="dtop">
    <div class="detail-icon-wrap">${iconHtml}</div>
    <div>
      <h1>${safeSource ? `<a href="${safeSource}" target="_blank" rel="noopener">${safeName}</a>` : safeName}</h1>
      ${pkg.version ? `<div class="dver">${escapeHtml(pkg.version)}</div>` : ''}
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
    <div class="note" style="margin-bottom:0.6rem">Needs this repo in your apt sources first &mdash; one-line setup on the <a href="/" style="color:var(--accent)">home page</a>.</div>
    <div class="dlinks">
      <a href="${escapeHtml(aptLink)}" class="primary">Install via package manager</a>
      ${safeSource ? `<a href="${safeSource}" target="_blank" rel="noopener">Homepage</a>` : ''}
    </div>
    <div class="term-box">
      <div class="term-header">
        <div class="term-title">apt install</div>
        <button class="copy-btn" data-copy="${escapeHtml(installCmd)}" aria-label="Copy install command">
          ${icon('copy', 13, 2, 'icon-copy')}${icon('check', 13, 2.5, 'icon-check')}<span class="copy-text">Copy</span>
        </button>
      </div>
      <div class="term-body">
        <pre><code><span class="hl-cmd">sudo apt</span> <span class="hl-arg">install</span> <span class="hl-str">${safeName}</span></code></pre>
      </div>
    </div>
  </div>
</main>

${sharedFooter(env.REPO, env.TELEGRAM)}

<div class="lb" id="lb">
  <button class="lb-btn lb-close" data-action="lb-close" aria-label="Close">${icon('close', 20, 2.5)}</button>
  <button class="lb-btn lb-prev" data-action="lb-prev" aria-label="Previous">${icon('chevronLeft', 20, 2.5)}</button>
  <button class="lb-btn lb-next" data-action="lb-next" aria-label="Next">${icon('chevronRight', 20, 2.5)}</button>
  <img id="lb-img" src="" alt="Screenshot preview">
</div>

<script>
${sharedScript()}
let ssIdx = 0;
const ssTotal = ${screenshots.length};
const lb = document.getElementById('lb');

function ssGo(i){
  if(ssTotal <= 1) return;
  ssIdx = ((i % ssTotal) + ssTotal) % ssTotal;
  const track = document.getElementById('ss-track');
  if(track) track.style.transform = 'translateX(-' + (ssIdx * 100) + '%)';
  document.querySelectorAll('.gallery-dot').forEach((d, j) => d.classList.toggle('active', j === ssIdx));
}
function openLb(src){
  const imgs = document.querySelectorAll('.ss-img');
  ssIdx = [...imgs].findIndex(i => i.src === src);
  if(ssIdx === -1) ssIdx = 0;
  document.getElementById('lb-img').src = src;
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeLb(){
  lb.classList.remove('open');
  document.body.style.overflow = '';
}
function lbSlide(d){
  const imgs = document.querySelectorAll('.ss-img');
  if(!imgs.length) return;
  ssIdx = ((ssIdx + d) % imgs.length + imgs.length) % imgs.length;
  document.getElementById('lb-img').src = imgs[ssIdx].src;
}

document.addEventListener('click', e => {
  const t = e.target instanceof Element ? e.target : null; if(!t) return;
  const act = t.closest('[data-action]');
  if(!act) return;
  const a = act.dataset.action;
  if(a === 'ss-prev') ssGo(ssIdx - 1);
  else if(a === 'ss-next') ssGo(ssIdx + 1);
  else if(a === 'ss-go') ssGo(+act.dataset.index);
  else if(a === 'lb-close') closeLb();
  else if(a === 'lb-prev') lbSlide(-1);
  else if(a === 'lb-next') lbSlide(1);
});
document.addEventListener('click', e => {
  const img = e.target.closest('.ss-img');
  if(img) openLb(img.src);
});
lb.addEventListener('click', e => { if(e.target === lb) closeLb(); });
document.addEventListener('keydown', e => {
  if(!lb.classList.contains('open')) return;
  if(e.key === 'Escape') closeLb();
  if(e.key === 'ArrowLeft') lbSlide(-1);
  if(e.key === 'ArrowRight') lbSlide(1);
});
</script>
</body>
</html>`;

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

function serveAbout(env: Env): Response {
  const { aptOrigin } = getOrigins(env);
  const safeOrigin = escapeHtml(aptOrigin);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
${sharedHead('About — ' + (env.SITE_NAME || 'apt-repo'), 'How this APT repository came to be, what it offers, and how you can help.')}
<style>
  .about h2{font-size:1.05rem;margin:1.6rem 0 .5rem;color:var(--text-primary)}
  .about p,.about li{color:var(--text-secondary);font-size:.92rem;line-height:1.7}
  .about strong{color:var(--text-primary)}
  .about .lead{font-size:1rem;color:var(--text-primary);line-height:1.6}
  .about ol{padding-left:1.2rem;display:flex;flex-direction:column;gap:.45rem;list-style:decimal}
  .about ul{padding-left:1.2rem;display:flex;flex-direction:column;gap:.3rem;list-style:disc}
  .about a{color:var(--accent)}
  .about a:hover{text-decoration:underline}
</style>
</head>
<body>
${sharedHeader(env.SITE_NAME || 'apt-repo', env.REPO, 'about', env.TELEGRAM)}
<main class="sec about">
  <h2>What is this?</h2>
  <p class="lead">A personal APT repository I keep for the software I use on my own machines. No advertising, no popups, no tracking &mdash; just packages that I install daily.</p>

  <h2>Where did it come from?</h2>
  <p>Many Linux projects ship only Snap, Flatpak, AppImage or their own bundle format. I wanted clean <code style="color:var(--text-primary)">deb</code> packages that integrate with the native package manager, so I built this repo to build and host them.</p>
  <p>Today it covers everything I personally run:</p>
  <ul>
    <li><strong>wine-staging</strong> with patches I need for my workflow</li>
    <li><strong>Docker</strong> (versioned releases, not the distro default)</li>
    <li><strong>miCONVERTER</strong>, <strong>Avidemux</strong>, <strong>GPA</strong></li>
    <li><strong>TeamViewer</strong>, <strong>VK Music</strong>, <strong>Blanket</strong></li>
    <li>and more &mdash; see the <a href="/packages">packages list</a></li>
  </ul>
  <p>Everything here builds reproducibly and is served through Cloudflare + GitHub Pages with GPG-signed indices.</p>

  <h2>How does it work?</h2>
  <p>The pipeline is fully automated:</p>
  <ol>
    <li>A scheduled GitHub Actions workflow checks upstream releases for new versions</li>
    <li>When a new version is found, a reproducible Docker build produces a <code style="color:var(--text-primary)">.deb</code></li>
    <li>The release is published to GitHub Releases, and the APT index is regenerated</li>
    <li>A Cloudflare Worker serves the website and proxies package downloads</li>
  </ol>
  <p>Everything &mdash; the build system, the worker, the website &mdash; lives in one repo and is public.</p>

  <h2>How can I use it?</h2>
  <p>Add this repo once and install any package from it like any other APT source:</p>
  <pre style="margin:.5rem 0;padding:.5rem;background:var(--bg-surface);border:1px solid var(--border-muted);border-radius:var(--radius-sm);font-size:.82rem;color:var(--text-primary)"><code>${safeOrigin}</code></pre>
  <p>Or see the <a href="/">home page</a> for the one-liner and manual instructions.</p>

  <h2>Open to contributions</h2>
  <p>If you use these packages and want to fix something or add a new one, contributions are welcome. Open a PR or an issue in the <a href="https://github.com/${escapeHtml(env.REPO || '')}" target="_blank" rel="noopener">GitHub repo</a> &mdash; I review everything and merge reasonably quickly.</p>
</main>
${sharedFooter(env.REPO, env.TELEGRAM)}
</body>
</html>`;

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

function serveNotFound(env: Env): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
${sharedHead('404 — ' + (env.SITE_NAME || 'apt-repo'), 'Page not found.')}
<style>
  .notfound{text-align:center;padding:4rem 1rem 3rem}
  .notfound h1{font-size:3.5rem;font-weight:800;color:var(--accent);margin:0 0 .5rem}
  .notfound p{font-size:1rem;color:var(--text-secondary);margin:0 0 1.5rem}
  .notfound a{color:var(--accent);text-decoration:underline}
</style>
</head>
<body>
${sharedHeader(env.SITE_NAME || 'apt-repo', env.REPO, undefined, env.TELEGRAM)}
<main class="sec notfound">
  <h1>404</h1>
  <p>Page not found.</p>
  <p><a href="/">Home</a> &middot; <a href="/packages">Packages</a></p>
</main>
${sharedFooter(env.REPO, env.TELEGRAM)}
</body>
</html>`;

  return new Response(html, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
