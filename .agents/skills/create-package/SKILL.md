# create-package

Create a new .deb package for the apt-repo project. Activated when the user asks to add or create a new package for a program.

## Workflow

### Step 1: Gather information

Ask the user these questions interactively:

1. **Upstream URL** — GitHub repo or project homepage
2. **App name** — short lowercase name (e.g. `localsend`, `keyd`)
3. **Description** — one-line human-readable description
4. **Version source** — how to detect the current version:
   - **GitHub releases** (`gh_latest_release`) — most common, use if upstream has releases
   - **GitHub tags + commits** (`gh_tag_ahead`) — no releases, but tags exist
   - **Custom file in repo** (`version.txt`, `meson.build`, etc.) — fetch and parse a file
   - **Web scraping** — parse HTML from a webpage
   - **Other** — describe in chat

### Step 2: Analyze the upstream

Based on the upstream URL, determine:

- **Does it have GitHub releases?** → check via `gh release list`
- **Does it provide prebuilt .deb files?** → check release assets for `.deb`
- **What language/build system?** → affects Dockerfile pattern
- **How is the version tracked?** → tag, commit count, custom file?

### Step 3: Choose patterns

#### Package patterns (apps/<name>/package)

| Pattern | When to use | Example |
|---|---|---|
| `gh_latest_release` | Repo has GitHub releases with tags | localsend, rclone, scrcpy |
| `gh_tag_ahead` | No releases, but tags exist, commits ahead of tag | bees, keyd, grub-btrfs |
| Web scraping | Version/changelog on a website, not GitHub | viber, remotedesktopmanager |
| Custom | Complex versioning, multiple sources | wlvncc, ayugram |

#### Dockerfile patterns (apps/<name>/Dockerfile)

| Pattern | When to use | Example |
|---|---|---|
| Download prebuilt .deb | Release has .deb asset | localsend, rclone, wps-office |
| Download tarball + repackage | Release has tarball, needs .deb wrapper | scrcpy |
| Build from source (manual) | No releases, compile from git | keyd, grub-btrfs |
| Build from source (debhelper) | Has debian/ dir or can create one | bees |

### Step 4: Generate files

Create `apps/<name>/package` and `apps/<name>/Dockerfile`.

### Step 5: Verify

Run `bash apps/build.sh <name>` locally (or at minimum validate syntax).

---

## Reference: package script contract

The `package` file is **sourced** by `apps/build.sh`. It must define:

```bash
SOURCE_URL="https://..."        # upstream URL
DESCRIPTION="..."               # one-line description

check_update() {                # exit 0 if update available
  ...
}

get_version() {                 # MUST set $version, SHOULD print changelog to stdout
  version="1.2.3"
  echo "changelog text here"
}
```

### Available helpers (from build.sh)

| Helper | Usage | Sets |
|---|---|---|
| `gh_latest_release <owner/repo>` | Fetches latest release | `$LATEST_TAG`, `$RELEASE_BODY` |
| `gh_tag_ahead <owner/repo>` | Latest tag + HEAD ahead count | `$LATEST_TAG`, `$HEAD_SHA`, `$AHEAD_COUNT` |
| `gh_tag_message <owner/repo> <tag>` | Annotated tag message | stdout |
| `gh_commits_between <owner/repo> <base> <head>` | Commits between refs | stdout |
| `gh_release_body <owner/repo>` | Latest release body | stdout |
| `gh_release_body_by_tag <owner/repo> <tag>` | Release body for tag | stdout |
| `fetch_url <url> [curl_args...]` | HTTP GET with direct→proxy fallback | stdout |

---

## Reference: Dockerfile contract

**Final stage must be `FROM scratch`** with exactly one `.deb` copied to `/`.

Build args available:
- `APP_VERSION` — from `get_version()`
- `DEBFULLNAME` — package maintainer name
- `DEBEMAIL` — package maintainer email

### Pattern: Download prebuilt .deb

```dockerfile
FROM alpine:latest AS download
ARG APP_VERSION
RUN apk add --no-cache curl && \
    curl -fsSL -o /app.deb "https://example.com/app_${APP_VERSION}_amd64.deb"

FROM scratch
COPY --from=download /app.deb /
```

### Pattern: Download tarball + repackage

```dockerfile
FROM alpine:latest AS download
ARG APP_VERSION
RUN apk add --no-cache curl && \
    curl -fsSL -o /src.tar.gz "https://example.com/v${APP_VERSION}.tar.gz" && \
    tar -xzf /src.tar.gz -C /src

FROM ubuntu:24.04 AS package
ARG APP_VERSION
RUN apt-get update && apt-get install -y -qq dpkg-dev
COPY --from=download /src /src
RUN mkdir -p /pkg/DEBIAN && \
    printf 'Package: my-app\nVersion: %s\nArchitecture: amd64\nDepends: libc6\nDescription: My app\n' \
      "$APP_VERSION" > /pkg/DEBIAN/control && \
    cp -r /src/* /pkg/ && \
    dpkg-deb --root-owner-group --build /pkg "/out/my-app_${APP_VERSION}_amd64.deb"

FROM scratch
COPY --from=package /out/*.deb /
```

### Pattern: Build from source (manual deb)

```dockerfile
FROM ubuntu:24.04 AS build
ARG APP_VERSION
RUN apt-get update && apt-get install -y -qq git make gcc dpkg-dev
RUN git clone --depth 1 --branch "v${APP_VERSION}" https://github.com/owner/repo /src
RUN cd /src && make

FROM ubuntu:24.04 AS package
ARG APP_VERSION
COPY --from=build /src/my-app /usr/local/bin/
RUN mkdir -p /pkg/DEBIAN && \
    printf 'Package: my-app\nVersion: %s\nArchitecture: amd64\nDepends: libc6\nDescription: My app\n' \
      "$APP_VERSION" > /pkg/DEBIAN/control && \
    dpkg-deb --root-owner-group --build /pkg "/out/my-app_${APP_VERSION}_amd64.deb"

FROM scratch
COPY --from=package /out/*.deb /
```

---

## Gotchas

1. **`ARG` after `FROM`** — must re-declare `ARG APP_VERSION` after each `FROM`, build args don't persist
2. **Version suffixes** — if version differs from tag (e.g. `.repack`), Dockerfile must reverse the transformation
3. **`gh` CLI** — all GitHub helpers require `gh` + `GH_TOKEN`. `fetch_url` only needs `PROXY_URL`/`PROXY_TOKEN` for proxy fallback
4. **`_amd64` suffix** — `.deb` filename must end with `_amd64.deb` for the build script to find it
5. **`check_update` is optional but recommended** — called by `check-updates.yml` to detect new versions
6. **`get_version` stdout** — captured as changelog, used in Telegram notifications. Keep it clean (no shell noise)
7. **Release tag format** — `<app>-<version>`, created automatically by `build.sh`
8. **Distro suffix** — `.deb` gets renamed to `_noble_amd64.deb` by `build.sh` before publishing

## Repository structure

```
apps/
├── build.sh                    # Main build script (DO NOT MODIFY without understanding)
├── <app-name>/
│   ├── Dockerfile              # Build instructions
│   └── package                 # Version detection + changelog
├── ...
docs/
└── template/                   # Reference templates
    ├── Dockerfile
    └── package
│   ├── Dockerfile              # Build instructions
│   └── package                 # Version detection + changelog
└── ...
```
