#!/usr/bin/env bash
set -e

# ============================================================
# Common helpers for package scripts (available when sourced)
# ============================================================

# gh_api_retry: gh api with retries on transient failures (503, timeouts)
# Usage: same as gh api — gh_api_retry repos/OWNER/REPO/tags
gh_api_retry() {
  local attempt=0 max=3 delay=2 result
  while (( attempt < max )); do
    if result=$(gh api "$@" 2>/dev/null); then
      printf '%s' "$result"
      return 0
    fi
    attempt=$((attempt + 1))
    (( attempt < max )) && sleep "$delay" && delay=$((delay * 2))
  done
  return 1
}

# gh_tag_ahead: Fetches latest tag, HEAD SHA, and ahead count
# Usage: gh_tag_ahead <owner/repo>
# Sets: LATEST_TAG, HEAD_SHA, AHEAD_COUNT
gh_tag_ahead() {
  local repo="$1"
  LATEST_TAG=$(gh_api_retry "repos/$repo/tags" --jq '.[0].name' 2>/dev/null || echo "unknown")
  HEAD_SHA=$(gh_api_retry "repos/$repo/commits/HEAD" --jq '.sha' 2>/dev/null || echo "")
  AHEAD_COUNT=$(gh_api_retry "repos/$repo/compare/$LATEST_TAG...HEAD" --jq '.ahead_by' 2>/dev/null || echo "0")
}

# gh_latest_release: Fetches latest release info
# Usage: gh_latest_release <owner/repo>
# Sets: LATEST_TAG, RELEASE_BODY
gh_latest_release() {
  local repo="$1" json
  json=$(gh_api_retry "repos/$repo/releases/latest" 2>/dev/null || echo '{"tag_name":"unknown","body":""}')
  LATEST_TAG=$(echo "$json" | jq -r '.tag_name')
  RELEASE_BODY=$(echo "$json" | jq -r '.body')
}

# gh_latest_release_with_asset: Fetches the most recent release whose assets
# include a name containing <substring>. Skips releases that don't ship the
# expected artifact (e.g. android-only releases), so check_update/get_version
# won't pick a version the Dockerfile can't download.
# Usage: gh_latest_release_with_asset <owner/repo> <asset-substring>
# Sets: LATEST_TAG, RELEASE_BODY; returns 1 if no release matches
gh_latest_release_with_asset() {
  local repo="$1" substring="$2" page=1 json count tag
  while :; do
    json=$(gh_api_retry "repos/$repo/releases?per_page=100&page=$page" 2>/dev/null) || return 1
    count=$(printf '%s' "$json" | jq 'length')
    tag=$(printf '%s' "$json" | jq -r --arg p "$substring" \
      '[.[] | select(any(.assets[]; (.name | index($p)) != null)) | .tag_name] | .[0] // empty')
    [ -n "$tag" ] && break
    [ "$count" -lt 100 ] && return 1
    page=$((page + 1))
  done
  LATEST_TAG="$tag"
  RELEASE_BODY=$(gh_api_retry "repos/$repo/releases/tags/$tag" --jq '.body' 2>/dev/null || echo "")
}

# gh_tag_message: Gets annotated tag message
# Usage: gh_tag_message <owner/repo> <tag>
# Returns 1 if not an annotated tag
gh_tag_message() {
  local repo="$1" tag="$2" ref type sha
  ref=$(gh_api_retry "repos/$repo/git/refs/tags/$tag" --jq '.object' 2>/dev/null) || return 1
  type=$(echo "$ref" | jq -r '.type')
  [ "$type" = "tag" ] || return 1
  sha=$(echo "$ref" | jq -r '.sha')
  gh_api_retry "repos/$repo/git/tags/$sha" --jq '.message' 2>/dev/null || return 1
}

# gh_commits_between: Lists commits between two refs
# Usage: gh_commits_between <owner/repo> <base> <head>
gh_commits_between() {
  local repo="$1" base="$2" head="$3"
  gh_api_retry "repos/$repo/compare/$base...$head" \
    --jq '.commits[] | "\(.sha[0:7]) \(.commit.message | split("\n")[0])"' 2>/dev/null || true
}

# gh_release_body: Gets latest release body
# Usage: gh_release_body <owner/repo>
gh_release_body() {
  local repo="$1"
  gh_api_retry "repos/$repo/releases" --jq '.[0].body // empty' 2>/dev/null || true
}

# gh_release_body_by_tag: Gets release body for a specific tag
# Usage: gh_release_body_by_tag <owner/repo> <tag>
gh_release_body_by_tag() {
  local repo="$1" tag="$2"
  gh_api_retry "repos/$repo/releases" --jq ".[] | select(.tag_name == \"$tag\") | .body // empty" 2>/dev/null || true
}

# pull_package_info: outputs package metadata header consumed by build.sh.
# Expects $version, $SOURCE_URL, $DESCRIPTION from the package script.
pull_package_info() {
  echo "version=$version"
  echo "source=$SOURCE_URL"
  echo "description=$DESCRIPTION"
  echo "---"
}

# check_update_safe: wrapper around a package's check_update() that treats an
# upstream-API failure as "no update", so we never trigger a rebuild from a
# transient error (e.g. gh api returning tag="unknown" / empty version).
# Usage: check_update_safe <current_version>
# Returns 0 if an update is available, 1 otherwise.
check_update_safe() {
  local current="${1:-}"
  version=""
  local ret
  check_update "$current"
  ret=$?
  # Only trust the result when the version could be resolved to something sane.
  if [ -z "$version" ] || [ "$version" = "unknown" ] || [[ "$version" == *"-unknown"* ]] \
     || [[ "$version" == "unknown"* ]] || [[ "$version" == *"unknown-"* ]]; then
    echo "check_update_safe: unresolved version '${version}', treating as no update"
    return 1
  fi
  return "$ret"
}

# fetch_url: Fetches URL (direct → proxy fallback)
# Usage: fetch_url <url> [curl_args...]
# Tries direct curl first, falls back to PROXY_URL if available.
fetch_url() {
  local url="$1"; shift
  local result
  result=$(curl -s --connect-timeout 10 --max-time 30 "$@" "$url" 2>/dev/null) && [ -n "$result" ] && { printf '%s' "$result"; return 0; }
  if [ -n "${PROXY_URL:-}" ] && [ -n "${PROXY_TOKEN:-}" ]; then
    local encoded
    encoded=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1],safe=''))" "$url")
    result=$(curl -s --connect-timeout 10 --max-time 30 \
      -H "X-Proxy-Token: ${PROXY_TOKEN}" \
      "$@" "${PROXY_URL}?url=${encoded}" 2>/dev/null) && [ -n "$result" ] && { printf '%s' "$result"; return 0; }
  fi
  return 1
}

# fetch_to_file: Downloads URL to <dest> (binary-safe, unlike fetch_url).
# Usage: fetch_to_file <url> <dest> [curl_args...]
# Direct curl first (fails on HTTP errors via -f), proxy fallback second.
# Returns non-zero if both paths fail; dest may be left partial on
# mid-transfer failure — check the exit code before using it.
fetch_to_file() {
  local url="$1" dest="$2"; shift 2
  if curl -fsSL --connect-timeout 10 --max-time 300 -o "$dest" "$@" "$url" 2>/dev/null; then
    return 0
  fi
  rm -f "$dest"
  if [ -n "${PROXY_URL:-}" ] && [ -n "${PROXY_TOKEN:-}" ]; then
    local encoded
    encoded=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1],safe=''))" "$url")
    curl -fsSL --connect-timeout 10 --max-time 300 \
      -H "X-Proxy-Token: ${PROXY_TOKEN}" \
      -o "$dest" "$@" "${PROXY_URL}?url=${encoded}" 2>/dev/null
  else
    return 1
  fi
}

# gh_fetch_raw: Fetches a raw file from a GitHub repo using the API
# Usage: gh_fetch_raw <owner/repo> <path> [branch]
# Uses gh api with GH_TOKEN, no curl/proxy needed.
gh_fetch_raw() {
  local repo="$1" path="$2" ref="${3:-master}"
  gh_api_retry "repos/$repo/contents/$path?ref=$ref" --jq '.content' 2>/dev/null | base64 -d 2>/dev/null
}

# ai_changelog: Generate a concise changelog from raw release notes via Gemini
# Usage: ai_changelog <package_name> <raw_text> [scope]
# <scope> optionally describes what the package contains when several packages
# share one upstream release; Gemini then keeps only changes that apply to it.
# Reads raw release notes, calls Gemini API, outputs concise changelog.
# Falls back to truncated raw text if GEMINI_API_KEY is unset or API fails.
ai_changelog() {
  local pkg_name="$1" raw_text="$2" scope="${3:-}"
  local api_key="${GEMINI_API_KEY:-}"
  api_key="${api_key//\"/}"
  api_key="${api_key//\'/}"
  api_key="$(echo "$api_key" | xargs)"

  if [ -z "$api_key" ]; then
    printf '%s' "$raw_text" | head -15
    return 0
  fi

  local scope_block=""
  if [ -n "$scope" ]; then
    scope_block="This upstream release ships as several packages built from one source tree.
The changelog must cover ONLY the package '$pkg_name', which contains: $scope.
Drop changes that belong to the other packages and drop build/packaging internals.
If no release note applies to this package, output exactly:
No user-facing changes for this release.

"
  fi

  local prompt="You are a technical writer for Linux packages. Generate a concise, useful changelog in English for the package '$pkg_name' based on the following release notes.

RULES:
- Write ONLY factual information useful to the end user.
- NO filler, NO praise, NO marketing language.
- NO technical developer terms (build system, CI, dpkg, Makefile).
- Length: 3-5 short bullet points in Markdown list format.
- If the release notes contain section headers, summarize the key user-facing changes from each section.
- Output ONLY the markdown list, nothing else.

${scope_block}RELEASE NOTES:
$raw_text"

  local payload
  payload=$(jq -n --arg p "$prompt" '{
    contents: [{parts: [{text: $p}]}],
    generationConfig: {temperature: 0.2}
  }')

  # flash-latest = alias for the newest stable Flash; explicit models are
  # fallbacks (gemini-2.5-flash reaches EOL 2026-10-16).
  local endpoints=(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent"
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent"
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
  )

  local result=""
  for url in "${endpoints[@]}"; do
    result=$(curl -s --max-time 30 \
      -H "Content-Type: application/json" \
      -H "X-goog-api-key: $api_key" \
      -d "$payload" "$url" 2>/dev/null) || continue
    result=$(echo "$result" | jq -r '.candidates[0].content.parts[0].text // empty' 2>/dev/null) || continue
    [ -n "$result" ] && break
  done

  if [ -n "$result" ]; then
    printf '%s' "$result"
  else
    printf '%s' "$raw_text" | head -15
  fi
}

# detect_license: Determine the SPDX license id for a project.
# Usage: detect_license <url_or_owner_repo>
# Tries, in order:
#   1. GitHub license API (repos/OWNER/REPO/license) — authoritative SPDX id
#   2. Raw LICENSE/COPYING file from the default branch (GitHub, GitLab)
#   3. Gemini summarization (GEMINI_API_KEY) — names the license from context;
#      only asked when the repo-based methods could not identify it
# Prints the SPDX id on stdout (e.g. MIT, Apache-2.0, GPL-3.0-or-later,
# LicenseRef-proprietary), or nothing (return 1) if it could not be determined.
# The caller decides the final license (e.g. fall back to LicenseRef-proprietary).

# _espdx_from_text: recognize a license from the opening lines of a LICENSE file.
# The first ~30 lines carry the authoritative header; wording further down the
# text is ignored (GPL-3 section 13 mentions the "GNU Affero General Public
# License", which would otherwise cause a false AGPL hit).
_espdx_from_text() {
  local first
  first=$(printf '%s' "$1" | sed -n '1,30p' | tr 'A-Z' 'a-z')
  local gpl agpl
  # Aggressive AGPL first — GPL-3 never names Affero in its first 30 lines.
  if printf '%s' "$first" | grep -q "gnu affero"; then
    agpl="AGPL-3.0"
    printf '%s' "$first" | grep -qE "or \(at your option\) any later|version 3 or later" && agpl="AGPL-3.0-or-later"
    printf '%s' "$agpl"; return 0
  fi
  if printf '%s' "$first" | grep -q "Apache License" ; then
    printf '%s' "$first" | grep -qE "License[[:space:]]*$|version 2\.0" && { printf '%s' "Apache-2.0"; return 0; }
    printf '%s' "Apache-2.0"; return 0
  fi
  if printf '%s' "$first" | grep -q "SIL OPEN FONT LICENSE"; then
    printf '%s' "OFL-1.1"; return 0
  fi
  if printf '%s' "$first" | grep -q "Mozilla Public License"; then
    printf '%s' "MPL-2.0"; return 0
  fi
  if printf '%s' "$first" | grep -q "redistribution and use in source and binary forms" &&
     printf '%s' "$first" | grep -q "all rights reserved"; then
    printf '%s' "BSD-3-Clause"; return 0
  fi
  if printf '%s' "$first" | grep -q "the mit license\|permission is hereby granted, free of charge"; then
    printf '%s' "MIT"; return 0
  fi
  if printf '%s' "$first" | grep -q "isc license\|permission to use, copy, modify"; then
    printf '%s' "ISC"; return 0
  fi
  if printf '%s' "$first" | grep -qE "gnu general public license|general public license"; then
    gpl="GPL-3.0"
    printf '%s' "$first" | grep -qE "version 2[ ,]|version 2$" && gpl="GPL-2.0"
    printf '%s' "$first" | grep -qE "or \(at your option\) any later|version [23] or later" && gpl="$gpl-or-later"
    printf '%s' "$gpl"; return 0
  fi
  return 1
}

# _espdx_fetch_raw: download a license-ish file and recognize it.
_espdx_fetch_raw() {
  local url="$1" text=""
  text=$(curl -fsSL --max-time 15 "$url" 2>/dev/null) || text=""
  [ -z "$text" ] && return 1
  printf '%s' "$text" | grep -qiE "<html|<!doctype" && return 1
  _espdx_from_text "$text"
}

detect_license() {
  local url="$1" api_key="${GEMINI_API_KEY:-}"
  api_key="${api_key//\"/}"; api_key="${api_key//\'/}"; api_key="$(echo "$api_key" | xargs)"

  # --- 1. GitHub license API ---
  if [[ "$url" =~ github\.com/([^/]+)/([^/]+)/? ]]; then
    local owner="${BASH_REMATCH[1]}" repo="${BASH_REMATCH[2]}"
    local lic
    lic=$(gh_api_retry "repos/$owner/$repo/license" --jq '.license.spdx_id // empty' 2>/dev/null || true)
    lic=$(echo "$lic" | xargs)
    if [ -n "$lic" ] && [ "$lic" != "NOASSERTION" ] && [ "$lic" != "OTHER" ]; then
      printf '%s' "$lic"; return 0
    fi
    # --- 2a. raw LICENSE fallback (default branch) ---
    for f in LICENSE LICENSE.md LICENSE.txt COPYING COPYING.md; do
      if lic=$(_espdx_fetch_raw "https://raw.githubusercontent.com/$owner/$repo/HEAD/$f"); then
        printf '%s' "$lic"; return 0
      fi
    done
  fi

  # --- 2b. GitLab raw LICENSE on master/main ---
  if [[ "$url" =~ gitlab\.com/(.+)$ ]]; then
    local path="${BASH_REMATCH[1]}"
    for branch in master main; do
      for f in LICENSE LICENSE.md LICENSE.txt COPYING COPYING.md COPYING.txt; do
        if lic=$(_espdx_fetch_raw "https://gitlab.com/$path/-/raw/$branch/$f"); then
          printf '%s' "$lic"; return 0
        fi
      done
    done
  fi

  # --- 3. Gemini fallback ---
  if [ -n "$api_key" ]; then
    local prompt="You are a licensing expert. Given the project URL '$url', tell me the SPDX license identifier this upstream project is released under. If the project appears to be proprietary/closed-source, reply exactly 'LicenseRef-proprietary'. If you cannot determine it, reply exactly 'unknown'. Reply with ONLY the SPDX identifier, nothing else."
    local payload
    payload=$(jq -n --arg p "$prompt" '{contents: [{parts: [{text: $p}]}], generationConfig: {temperature: 0}}')
    local endpoints=(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent"
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent"
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
    )
    local result=""
    for gemurl in "${endpoints[@]}"; do
      result=$(curl -s --max-time 30 \
        -H "Content-Type: application/json" \
        -H "X-goog-api-key: $api_key" \
        -d "$payload" "$gemurl" 2>/dev/null) || continue
      result=$(echo "$result" | jq -r '.candidates[0].content.parts[0].text // empty' 2>/dev/null) || continue
      [ -n "$result" ] && break
    done
    if [ -n "$result" ]; then
      result=$(echo "$result" | xargs)
      case "$result" in
        unknown|Unknown|UNKNOWN|"") ;;
        *) printf '%s' "$result"; return 0 ;;
      esac
    fi
  fi

  return 1
}

# ============================================================
# Main logic (skipped when sourced — e.g. from check-updates.yml)
# ============================================================
if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
  return 0
fi

app="${1:?Usage: build.sh <app> [current_version] [distro]}"
current_version="$2"
distro="${3:-noble}"
dir="$(cd "$(dirname "$0")" && pwd)/$app"

[ -d "$dir" ] || { echo "App $app not found"; exit 1; }
[ -f "$dir/Dockerfile" ] || { echo "Dockerfile not found for $app"; exit 1; }
[ -f "$dir/package" ] || { echo "No package file for $app"; exit 1; }

source "$dir/package"

if ! declare -f get_version > /dev/null; then
  echo "get_version not defined in $dir/package"; exit 1
fi

get_version "$current_version" > /tmp/changelog
[ -z "$version" ] && { echo "Failed to parse version"; exit 1; }
[ -z "$SOURCE_URL" ] && { echo "Failed to parse source URL"; exit 1; }

pull_package_info > /tmp/version_info
cat /tmp/changelog >> /tmp/version_info

if [ -n "$GITHUB_ACTIONS" ]; then
  owner_info="$(gh_api_retry users/"$GITHUB_REPOSITORY_OWNER")"
  DEBFULLNAME="$(echo "$owner_info" | jq -r '.name // empty')"
  DEBEMAIL="$(echo "$owner_info" | jq -r '.email // empty')"
fi
DEBFULLNAME="${DEBFULLNAME:-$GITHUB_REPOSITORY_OWNER}"
DEBEMAIL="${DEBEMAIL:-$GITHUB_REPOSITORY_OWNER@users.noreply.github.com}"

if [ -s /tmp/changelog ]; then
  cp /tmp/changelog "$dir/.changelog"
fi

case "$distro" in
  noble)  UPSTREAM_PKG_SUFFIX="ubuntu26.04.1" ;;
  trixie) UPSTREAM_PKG_SUFFIX="debian13.1" ;;
  *)      UPSTREAM_PKG_SUFFIX="$distro" ;;
esac

docker buildx build \
  --output type=local,dest=/tmp/deb-out \
  --cache-from type=gha \
  --cache-to type=gha,mode=max \
  --build-arg "DEBFULLNAME=$DEBFULLNAME" \
  --build-arg "DEBEMAIL=$DEBEMAIL" \
  --build-arg "APP_VERSION=$version" \
  --build-arg "UPSTREAM_PKG_SUFFIX=$UPSTREAM_PKG_SUFFIX" \
  -f "$dir/Dockerfile" "$dir"

rm -f "$dir/.changelog"

deb="$(ls /tmp/deb-out/*.deb 2>/dev/null | head -1)"
[ -z "$deb" ] && { echo "No .deb produced"; exit 1; }

if [ -n "$GITHUB_ACTIONS" ] && [ "$GITHUB_REF" = "refs/heads/apps" ]; then
  deb_name="$(basename "$deb" | sed -e "s/_amd64/_${distro}_amd64/" -e "s/_all/_${distro}_all/")"
  mv "$deb" "/tmp/$deb_name"

    if [ -s /tmp/changelog ]; then
      notes_flag="--notes-file /tmp/changelog"
    else
      notes_flag=""
    fi
    if gh release view "$app-$version" --repo "$GITHUB_REPOSITORY" > /dev/null 2>&1; then
      echo "Release $app-$version already exists, skipping"
    else
      attempt=0 max=3 delay=2
      while (( attempt < max )); do
        gh release create \
          "$app-$version" \
          "/tmp/$deb_name" \
          --title "$app $version" \
          $notes_flag \
          --repo "$GITHUB_REPOSITORY" && break
        attempt=$((attempt + 1))
        if (( attempt < max )); then
          echo "gh release create failed, retrying in ${delay}s..."
          sleep "$delay"
          delay=$((delay * 2))
        fi
      done
    fi

  # Drop GitHub's auto-generated source archives (<tag>.tar.gz / <tag>.zip)
  # so the release page ships only the .deb (added in edaf605).
  gh release delete-asset "$app-$version" "$app-$version.tar.gz" --repo "$GITHUB_REPOSITORY" --yes 2>/dev/null || true
  gh release delete-asset "$app-$version" "$app-$version.zip" --repo "$GITHUB_REPOSITORY" --yes 2>/dev/null || true
fi

echo "Done: $app $version"
