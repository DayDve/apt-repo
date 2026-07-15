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

function serveText(): Response {
  const text = [
    '#  ___            ___              _   ___ _____   ___',
    '# |   \\ __ _ _  _|   \\__ _____    /_\\ | _ \\_   _| | _ \\___ _ __  ___',
    '# | |) / _` | || | |) \\ V / -_)  / _ \\|  _/ | |   |   / -_) \'_ \\/ _ \\',
    '# |___/\\__,_|\\_, |___/ \\_/\\___| /_/ \\_\\_|   |_|   |_|_\\___| .__/\\___/',
    '#            |__/                                         |_|',
    '#',
    '# Personal APT repository for software unavailable or outdated in',
    '# standard Ubuntu/Debian repos.',
    '#',
    '# Add the repository to your APT sources:',
    '#',
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

  const pkgNames = pkgs ? pkgs.map(p => p.name).join(', ') : 'ayugram, bees, grub-btrfs, keyd, rclone, rdm, wps-office';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DayDve APT Repository — ${pkgNames}</title>
<meta name="description" content="Personal APT repository for Ubuntu with packages unavailable in standard repos: ${pkgNames}. Install via apt.smbit.pro.">
<meta name="keywords" content="APT, repository, Ubuntu, noble, ${pkgNames}">
<meta property="og:title" content="DayDve APT Repository">
<meta property="og:description" content="Personal APT repository for Ubuntu with: ${pkgNames}">
<meta property="og:type" content="website">
<meta property="og:url" content="${url.origin}">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github-dark.min.css" crossorigin="anonymous">
<style>
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:800px;margin:0 auto;padding:2rem;line-height:1.6;color:#e6edf3;background:#0d1117}
a{color:#58a6ff}
pre{background:#161b22;padding:1rem;border-radius:6px;overflow-x:auto;position:relative;border:1px solid #30363d;font-size:.85rem;margin:0}
pre code{background:0 0;padding:0;border-radius:0}
table{border-collapse:collapse;width:100%}
th,td{text-align:left;padding:.5rem;border-bottom:1px solid #30363d}
td a{text-decoration:none;color:#58a6ff}
td a:hover{text-decoration:underline}
.code-header{display:flex;justify-content:flex-end;margin-bottom:0}
.copy-btn{font-size:.75rem;padding:.2rem .6rem;border:1px solid #30363d;border-radius:4px;background:#21262d;cursor:pointer;color:#8b949e;font-family:inherit}
.copy-btn:hover{background:#30363d}
.copy-btn.copied{color:#3fb950;border-color:#3fb950}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0}
</style>
</head>
<body>
<h1 class="sr-only">DayDve APT Repository — ${pkgNames}</h1>
<pre aria-hidden="true" style="background:0 0;border:0;padding:0;font-size:.8rem;line-height:1.2"> ___            ___              _   ___ _____   ___               
|   \\ __ _ _  _|   \\__ _____    /_\\ | _ \\_   _| | _ \\___ _ __  ___ 
| |) / _\` | || | |) \\ V / -_)  / _ \\|  _/ | |   |   / -_) '_ \\/ _ \\
|___/\\__,_|\\_, |___/ \\_/\\___| /_/ \\_\\_|   |_|   |_|_\\___| .__/\\___/
           |__/                                         |_|        </pre>
<p>Personal APT repository for Ubuntu Noble with software unavailable or outdated in standard repos.</p>

<h2>Setup</h2>
<div class="code-header"><button class="copy-btn" onclick="copy(this)">Copy</button></div>
<pre><code class="language-bash">sudo curl -fsSL ${url.origin}/apt-key.asc \\
  -o /etc/apt/keyrings/daydve-apt-repo.asc && \\
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/daydve-apt-repo.asc] \\
  ${url.origin} noble main" \\
  | sudo tee /etc/apt/sources.list.d/daydve-apt-repo.list && \\
sudo apt update</code></pre>

<h2>Quick install</h2>
<div class="code-header"><button class="copy-btn" onclick="copy(this)">Copy</button></div>
<pre><code class="language-bash">curl -sL ${url.origin} | bash</code></pre>

<h2>Available packages</h2>
<table>
<tr><th>Package</th><th>Description</th></tr>
${rows}
</table>

<p><a href="https://github.com/${REPO}"><img src="https://img.shields.io/badge/GitHub-DayDve%2Fapt--repo-181717?logo=github" alt="GitHub Repository"></a></p>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "name": "DayDve APT Repository",
  "description": "Personal APT repository for Ubuntu Noble with: ${pkgNames}",
  "url": "${url.origin}",
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
function copy(b){let c=b.parentElement.nextElementSibling;navigator.clipboard.writeText(c.textContent).then(()=>{b.textContent="Copied!";b.classList.add("copied");setTimeout(()=>{b.textContent="Copy";b.classList.remove("copied")},2000)}).catch(()=>{})}</script>
</body>
</html>`;
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
