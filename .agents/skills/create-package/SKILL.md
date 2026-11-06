---
name: create-package
description: Add a new .deb package to this apt-repo (apps/<app>/package + apps/<app>/Dockerfile) that repackages or builds upstream software and auto-tracks its updates. Use when the user asks to add, create, package or "завернуть в deb" a new program/app/tool for the APT repo, or to model a new package on an existing one.
---

# create-package

Creates `apps/<app>/package` + `apps/<app>/Dockerfile` on the `apps` branch. The authoritative
contract and full recipes live in `docs/template/package` and `docs/template/Dockerfile` — read both
before writing files. This skill is the workflow + the decisions; don't duplicate the templates.

## Workflow

### 1. Get the upstream, infer the rest

Only the **upstream URL** is required from the user. Infer everything else yourself and only ask
about what you genuinely cannot determine (or confirm your guesses in one message):

- **`<app>` dir name** — short lowercase id (`localsend`, `keyd`). Internal only: release tag
  `<app>-<version>`, site slug, screenshot names. It is *not* the `apt install` name (that is read
  from the built `.deb`'s `Package:` field).
- **`DESCRIPTION`** — one line; take it from the repo description / homepage.
- **`APP_NAME`** — only if the product name differs from the dir name (e.g. dir `tmog`).

### 2. Analyze the upstream

**Preflight:** `command -v gh && gh auth status`. If `gh` is missing or not logged in:

- Analysis still works through the public API with curl (unauthenticated limit is 60 req/h):
  `curl -s https://api.github.com/repos/owner/repo/releases/latest | jq -r '.tag_name, .assets[].name'`
  (same paths for `/releases`, `/tags`, `/repos/owner/repo`; add
  `-H "Authorization: Bearer $GH_TOKEN"` if a token exists).
- The local build in step 5 still works. Without `gh`, the `gh_*` helpers in `build.sh` switch
  to curl, and they send `GH_TOKEN`/`GITHUB_TOKEN` if one is set. Without a token the limit is
  60 req/h, and `build.sh` prints a warning about it. Each run makes only a few requests, but repeated
  runs add up, so suggest setting `GH_TOKEN` if you hit the limit. On a failed API call `build.sh` stops with
  `Failed to parse version (got 'unknown')`, which usually means rate limit or a bad token.
- Never push to `apps` just to "let CI test it": that push publishes a real release.

With `gh` available:

```bash
gh release list -R owner/repo -L 5                       # releases at all?
gh release view -R owner/repo --json tagName,assets -q '.tagName, .assets[].name'   # .deb / tarball / AppImage?
gh api repos/owner/repo/tags -q '.[0:5][].name'          # tags without releases?
gh api repos/owner/repo -q '.license.spdx_id, .language' # license + build system hint
```

Also check: does upstream ship a `debian/` dir or `.dsc` source package? Is the version in a file
(`meson.build`, `version.txt`) instead of tags? Is the host reachable only via proxy from GHA?

### 3. Pick patterns

**Version detection (`package`)** — recipes in `docs/template/package`:

| Pattern | When | Examples |
|---|---|---|
| `gh_latest_release` | Normal GitHub releases | rclone, scrcpy, wps-office |
| `gh_latest_release_with_asset <repo> <substr>` | Some releases lack the Linux asset | localsend |
| `gh_tag_ahead` → `${tag#v}-${ahead}-g${sha:0:7}` | Tags but no releases / track HEAD | bees, keyd, grub-btrfs |
| `gh_fetch_raw` + parse | Version lives in a file in the repo | — |
| Web scraping (`fetch_url` + regex) | Not on GitHub | viber, remotedesktopmanager |
| Custom / multi-source | Odd versioning, submodules, rebuilds | wlvncc, ayugram |

**Build (`Dockerfile`)** — patterns in `docs/template/Dockerfile`:

| Pattern | When | Examples |
|---|---|---|
| Download prebuilt `.deb` | Release ships an amd64 `.deb` | localsend, rclone, wps-office |
| Tarball/binary → hand-made `.deb` | Release ships binaries, no `.deb` | scrcpy |
| Build from source, manual `DEBIAN/control` | Simple make/cargo/go build | keyd, grub-btrfs |
| Build with debhelper | Upstream has `debian/` or it's easy to add | bees |
| Rebuild upstream `.dsc` (uses `UPSTREAM_PKG_SUFFIX`) | Upstream publishes distro-suffixed source pkgs | mc6 family |

Before writing, open the closest existing example from the tables and copy its structure.

### 4. Write the files

`package` (sourced by `apps/build.sh`; both functions receive current version as `$1`):

```bash
SOURCE_URL="https://github.com/owner/repo"
DESCRIPTION="One-line description"
DEVELOPER="Upstream Author"
APPSTREAM_TYPE="desktop-application"
APPSTREAM_CATEGORIES="Network;FileTransfer"

check_update() {          # exit 0 = update available
  gh_latest_release owner/repo
  version="${LATEST_TAG#v}"
  [ "$version" != "${1:-}" ]
}

get_version() {           # MUST set $version; stdout = changelog (keep it clean)
  gh_latest_release owner/repo
  version="${LATEST_TAG#v}"
  echo "$RELEASE_BODY"
}
```

Optional vars (full list + semantics in the `docs/template/package` header):

| Var | Purpose |
|---|---|
| `APPSTREAM_TYPE` | `desktop-application` / `console-application` / `font` / `addon` / `none` (hide from DEP-11) |
| `APPSTREAM_CATEGORIES` | Freedesktop categories, `;`-separated |
| `APPSTREAM_KEYWORDS`, `APPSTREAM_SUMMARY` | Discover search keywords (`,`), short summary |
| `DEVELOPER` | Upstream author shown in Discover (almost every package sets it) |
| `LICENSE` | SPDX id; unset = auto-detect (`detect_license`). Closed source: `LicenseRef-proprietary` |
| `APP_NAME` | Product display name if it differs from dir name |
| `ICON_SOURCE` / `ICON_PATH` | `deb` (default, auto-extract `hicolor/*/apps/*.png`) / `file` (rel. to `apps/<app>/`) / `url` |
| `CHANGELOG_URL` | "Full changelog" link in Telegram (default `SOURCE_URL`) |
| `PINNED_VERSIONS` | Comma-separated versions never pruned from releases |
| `FAMILY`, `GROUP` | Multi-package families (Telegram bundling / one site row) — see `apps/mc6*/package` |

Long changelogs / commit lists: pipe through `ai_changelog <app> "$raw" [scope]` (Gemini; falls
back to raw text without `GEMINI_API_KEY`).

`Dockerfile` rules:

- Final stage **`FROM scratch`** with `COPY --from=<stage> /path/*.deb /` — exactly one `.deb`.
- Output filename must end in **`_amd64.deb`** (build.sh renames it to `_<distro>_amd64.deb`).
- **Re-declare `ARG APP_VERSION`** (and `DEBFULLNAME`, `DEBEMAIL`, `UPSTREAM_PKG_SUFFIX` if used)
  after every `FROM`.
- Hand-made `.deb`s: set `Maintainer: ${DEBFULLNAME} <${DEBEMAIL}>`, real `Depends:`, and
  `dpkg-deb --root-owner-group --build`.
- If `version` was transformed from the tag (suffixes, `-N-gSHA`, epochs), reverse it in the
  Dockerfile when building download URLs / git refs.

Optional assets: `apps/<app>/screenshots/0.png, 1.jpg, …` (display order), long description in
`apps/descriptions.json` (`{"<app>": {"description": "…"}}`).

### 5. Verify — required

```bash
bash apps/build.sh <app>              # builds into /tmp/deb-out/, publishes nothing locally
dpkg-deb -I /tmp/deb-out/*<app>*.deb  # check Package/Version/Depends/Maintainer
dpkg-deb -c /tmp/deb-out/*<app>*.deb | head -30
```

`build.sh` never calls `check_update` — test it separately (must print `no-update` for the
version just built, `update` for an older one):

```bash
bash -c 'source apps/build.sh; source apps/<app>/package;
  check_update_safe "$1" >/dev/null && echo update || echo no-update' _ <version>
```

Don't declare done until the build succeeds.

## Gotchas

1. Optional vars are parsed by `deploy-apt.yml` with `awk -F'"' '/^VAR=/{print $2}'` — keep each as a
   **single `VAR="value"` line at column 0**, no computed values, or it's silently dropped.
2. `check_update` must set `$version`: `check_update_safe` treats empty / `unknown` versions as "no
   update", so a broken API call won't trigger a rebuild — but also won't error loudly.
3. `get_version` stdout becomes the Telegram/release changelog — no debug output, no `set -x` noise
   (send diagnostics to stderr).
4. GitHub helpers need `gh` + `GH_TOKEN`. Use `fetch_url` (text) / `fetch_to_file` (binary) for
   non-GitHub hosts — they fall back to the gha-proxy Worker when GHA runners can't reach the host.
5. Don't modify `apps/build.sh`, don't hand-edit `README.md` (auto-generated), never touch the `apt`
   branch.
6. Version must sort correctly in dpkg (`dpkg --compare-versions`) against previous releases; if the
   scheme ever goes backwards, an epoch (`1:`) is needed.
