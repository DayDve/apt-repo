# Architecture

Personal APT repository for Ubuntu/Debian packages unavailable or outdated in standard repos.

## Branches

The project uses three isolated branches. No file crosses branch boundaries:

| Branch | Purpose |
|--------|---------|
| `apps` | Package definitions (`apps/*/`), CI/CD (`check-updates.yml`, `deploy-apt.yml`), documentation (`docs/`) |
| `worker` | Cloudflare Workers (`workers/apt-repo/`, `workers/gha-proxy/`) + `deploy-worker.yml` |
| `apt` | APT repository data (`dists/`, `pool/`, `Packages`, `Release`, `packages.json`) |

---

## CI/CD Pipeline

```mermaid
flowchart TD
  CRON["cron: every 6h"]
  MAN["workflow_dispatch"]
  CUK["check-updates.yml"]

  subgraph CUKB[check-updates.yml build]
    DETECT["detect: matrix of app directories"]
    BUILD["build (matrix):
          gh release list → grep app tag
          source package → check_update()
          docker buildx build → .deb
          gh release create"]
    FAIL["Notify Failure:
          Telegram → OWNER_ID"]
  end

  subgraph DEP[deploy-apt.yml]
    DP1["Checkout apt branch"]
    DP2["Import GPG key"]
    DP3["Download .deb files
         from changed releases only,
         merge with existing pool"]
    DP4["dpkg-scanpackages
         → Packages"]
    DP5["apt-ftparchive → Release
         GPG sign"]
    DP6["Commit + push to apt"]
    DP7["Update README.md"]
    DP8["Telegram: .deb + caption
         to channel"]
  end

  subgraph WK[deploy-worker.yml]
    WK1["npx wrangler deploy
         apt-repo + gha-proxy"]
  end

  CRON --> CUK
  MAN --> CUK
  CUK --> DETECT --> BUILD
  BUILD -- "at least one success" --> DEP
  BUILD -- "all failed" --> FAIL
  DEP --> DP1 --> DP2 --> DP3 --> DP4 --> DP5 --> DP6 --> DP7 --> DP8
  DP6 -- "push to apt" --> WK
```

---

## Cloudflare Workers (branch `worker`)

### apt-repo

Frontend serving APT repository files.

```mermaid
flowchart LR
  U["User
      apt-get / browser / curl"]
  W["apt-repo worker"]
  P["Cloudflare Pages
      (apt-key.asc, dists/)"]
  GH["GitHub Releases
      (pool/* → 302 redirect)"]

  U --> W
  W -- "/, /" --> U
  W -- "/apt-key.asc, /dists/*" --> P
  W -- "/pool/*" --> GH
```

Configurable via env vars: `REPO`, `PAGES_ORIGIN`, `CACHE_BUST`, `SITE_NAME`, `AUTHOR`, `TELEGRAM`

### gha-proxy

HTTP proxy for CI, deployed as a Cloudflare Worker. Provides a fallback path for `fetch_url()` in `apps/build.sh` when direct outbound requests from GitHub Actions runners fail (network restrictions, API blocks, etc.).

**Flow:**
1. `fetch_url(url)` tries direct `curl` with connect timeout of 10s
2. If that fails and `PROXY_URL`/`PROXY_TOKEN` are set, it URL-encodes the target URL and sends a GET to `PROXY_URL?url=<encoded>` with `X-Proxy-Token` header
3. The worker validates the token (403 if mismatch), rejects non-HTTPS targets (400), and forwards the request stripping the auth header
4. The response body is returned back to the caller

**Secrets** (`check-updates.yml`, `deploy-apt.yml`):
- `PROXY_URL` — worker endpoint
- `PROXY_TOKEN` — shared token for `X-Proxy-Token`

Any package whose `check_update()` or `get_version()` fetches from external APIs uses `fetch_url()` and thus benefits from the fallback.

---

## Telegram notifications

```mermaid
sequenceDiagram
  participant GHA as GitHub Actions
  participant DKR as Docker (aiogram/telegram-bot-api)
  participant TG as Telegram API
  participant USR as User

  GHA ->> DKR: docker run (local Bot API)
  DKR -->> GHA: Ready (port 8081)

  alt Build failure
    GHA ->> TG: POST sendMessage (OWNER_ID)
    TG -->> USR: ❌ Build failed
  else Deploy failure
    GHA ->> TG: POST sendMessage (OWNER_ID)
    TG -->> USR: ❌ Deploy failed
  else Successful deploy
    GHA ->> DKR: POST sendDocument (.deb + HTML caption)
    DKR ->> TG: sendDocument
    TG -->> USR: 📦 New package
  end
```

---

## Package build system

```mermaid
flowchart TD
  subgraph APP["apps/&lt;name&gt;/"]
    DOCKER["Dockerfile
          Multistage build
          FROM scratch final
          COPY --from=... *.deb /"]
    PKG["package
         SOURCE_URL
         DESCRIPTION
         check_update()
         get_version()"]
  end

  PKG --> SH["apps/build.sh
             gh_tag_ahead / gh_latest_release
             fetch_url / gh_fetch_raw"]
  SH --> DKR2["docker buildx build
              --build-arg APP_VERSION
              --cache-from type=gha"]
  DKR2 --> DEB[".deb file"]
  DEB --> REL["gh release create
              --notes-file /tmp/changelog"]
```

### package functions

| Function | Purpose |
|----------|---------|
| `check_update()` | Checks if an update is available (exit 0 = yes) |
| `get_version()` | Outputs changelog to stdout, sets `$version` |
| `SOURCE_URL` | Project URL |
| `DESCRIPTION` | Package description |

Template for a new package: [`docs/template/`](template/).

### Helpers (in `apps/build.sh`)

| Function | Purpose |
|----------|---------|
| `fetch_url <url>` | HTTP request (curl → gha-proxy fallback) |
| `gh_fetch_raw <repo> <path>` | Fetch file from GitHub via API |
| `gh_tag_ahead <repo>` | Tag + commits ahead |
| `gh_latest_release <repo>` | Latest release |
| `gh_release_body[_by_tag]` | Release changelog |
| `pull_package_info` | Log header |

---

## APT repository structure (branch `apt`)

```mermaid
flowchart LR
  subgraph APT["branch apt (GitHub → Pages)"]
    AK["apt-key.asc"]
    PJ["packages.json"]
    PM["pool-map.json"]
    PO["pool/&lt;distro&gt;/main/*.deb"]
    DI["dists/&lt;distro&gt;/
       Packages, Packages.gz
       Release, Release.gpg, InRelease"]
  end

  PO -- "redirect" --> GHREL["GitHub Releases"]
  DI -- "proxy" --> W["apt-repo worker"]
  AK -- "proxy" --> W
```
