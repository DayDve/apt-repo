#!/usr/bin/env bash
set -e

# ============================================================
# Common helpers for package scripts (available when sourced)
# ============================================================

# gh_tag_ahead: Fetches latest tag, HEAD SHA, and ahead count
# Usage: gh_tag_ahead <owner/repo>
# Sets: LATEST_TAG, HEAD_SHA, AHEAD_COUNT
gh_tag_ahead() {
  local repo="$1"
  LATEST_TAG=$(gh api "repos/$repo/tags" --jq '.[0].name' 2>/dev/null || echo "unknown")
  HEAD_SHA=$(gh api "repos/$repo/commits/HEAD" --jq '.sha' 2>/dev/null || echo "")
  AHEAD_COUNT=$(gh api "repos/$repo/compare/$LATEST_TAG...HEAD" --jq '.ahead_by' 2>/dev/null || echo "0")
}

# gh_latest_release: Fetches latest release info
# Usage: gh_latest_release <owner/repo>
# Sets: LATEST_TAG, RELEASE_BODY
gh_latest_release() {
  local repo="$1" json
  json=$(gh api "repos/$repo/releases/latest" 2>/dev/null || echo '{"tag_name":"unknown","body":""}')
  LATEST_TAG=$(echo "$json" | jq -r '.tag_name')
  RELEASE_BODY=$(echo "$json" | jq -r '.body')
}

# gh_tag_message: Gets annotated tag message
# Usage: gh_tag_message <owner/repo> <tag>
# Returns 1 if not an annotated tag
gh_tag_message() {
  local repo="$1" tag="$2" ref type sha
  ref=$(gh api "repos/$repo/git/refs/tags/$tag" --jq '.object' 2>/dev/null) || return 1
  type=$(echo "$ref" | jq -r '.type')
  [ "$type" = "tag" ] || return 1
  sha=$(echo "$ref" | jq -r '.sha')
  gh api "repos/$repo/git/tags/$sha" --jq '.message' 2>/dev/null || return 1
}

# gh_commits_between: Lists commits between two refs
# Usage: gh_commits_between <owner/repo> <base> <head>
gh_commits_between() {
  local repo="$1" base="$2" head="$3"
  gh api "repos/$repo/compare/$base...$head" \
    --jq '.commits[] | "\(.sha[0:7]) \(.commit.message | split("\n")[0])"' 2>/dev/null || true
}

# gh_release_body: Gets latest release body
# Usage: gh_release_body <owner/repo>
gh_release_body() {
  local repo="$1"
  gh api "repos/$repo/releases" --jq '.[0].body // empty' 2>/dev/null || true
}

# gh_release_body_by_tag: Gets release body for a specific tag
# Usage: gh_release_body_by_tag <owner/repo> <tag>
gh_release_body_by_tag() {
  local repo="$1" tag="$2"
  gh api "repos/$repo/releases" --jq ".[] | select(.tag_name == \"$tag\") | .body // empty" 2>/dev/null || true
}

# web_get: Fetch a URL with common options
# Usage: web_get <url>
# Outputs response body to stdout
web_get() {
  curl -fsSL "$1" 2>/dev/null || return 1
}

# web_get_headers: Fetch only HTTP headers
# Usage: web_get_headers <url>
# Outputs headers to stdout
web_get_headers() {
  curl -fsSLI "$1" 2>/dev/null || return 1
}

# web_grep: Fetch a URL and extract first match by regex
# Usage: web_grep <url> <regex>
# Outputs the first matching line
web_grep() {
  curl -fsSL "$1" 2>/dev/null | grep -oP "$2" | head -1 || return 1
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

get_version "$current_version" > /tmp/version_info
version="$(sed -n '1s/^version=//p' /tmp/version_info)"
SOURCE_URL="$(sed -n '2s/^source=//p' /tmp/version_info)"
tail -n +4 /tmp/version_info > /tmp/changelog 2>/dev/null || true
[ -z "$version" ] && { echo "Failed to parse version"; exit 1; }
[ -z "$SOURCE_URL" ] && { echo "Failed to parse source URL"; exit 1; }

if [ -n "$GITHUB_ACTIONS" ]; then
  owner_info="$(gh api users/"$GITHUB_REPOSITORY_OWNER")"
  DEBFULLNAME="$(echo "$owner_info" | jq -r '.name // empty')"
  DEBEMAIL="$(echo "$owner_info" | jq -r '.email // empty')"
fi
DEBFULLNAME="${DEBFULLNAME:-$GITHUB_REPOSITORY_OWNER}"
DEBEMAIL="${DEBEMAIL:-$GITHUB_REPOSITORY_OWNER@users.noreply.github.com}"

docker buildx build \
  --output type=local,dest=/tmp/deb-out \
  --cache-from type=gha \
  --cache-to type=gha,mode=max \
  --build-arg "DEBFULLNAME=$DEBFULLNAME" \
  --build-arg "DEBEMAIL=$DEBEMAIL" \
  --build-arg "APP_VERSION=$version" \
  -f "$dir/Dockerfile" "$dir"

deb="$(ls /tmp/deb-out/*.deb 2>/dev/null | head -1)"
[ -z "$deb" ] && { echo "No .deb produced"; exit 1; }

if [ -n "$GITHUB_ACTIONS" ] && { [ "$GITHUB_REF" = "refs/heads/main" ] || [ "$GITHUB_REF" = "refs/heads/master" ]; }; then
  deb_name="$(basename "$deb" | sed "s/_amd64/_${distro}_amd64/")"
  mv "$deb" "/tmp/$deb_name"

  jq -n --arg source "$SOURCE_URL" --arg app "$app" --arg version "$version" \
    '{app:$app,version:$version,source:$source}' > "/tmp/meta-$app.json"

  gh release create \
    "$app-$version" \
    "/tmp/$deb_name" \
    "/tmp/meta-$app.json" \
    --draft \
    --title "$app $version" \
    --notes-file /tmp/changelog \
    --repo "$GITHUB_REPOSITORY"
fi

echo "Done: $app $version"
