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

# pull_package_info: outputs package metadata header consumed by build.sh.
# Expects $version, $SOURCE_URL, $DESCRIPTION from the package script.
pull_package_info() {
  echo "version=$version"
  echo "source=$SOURCE_URL"
  echo "description=$DESCRIPTION"
  echo "---"
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

# gh_fetch_raw: Fetches a raw file from a GitHub repo using the API
# Usage: gh_fetch_raw <owner/repo> <path> [branch]
# Uses gh api with GH_TOKEN, no curl/proxy needed.
gh_fetch_raw() {
  local repo="$1" path="$2" ref="${3:-master}"
  gh api "repos/$repo/contents/$path?ref=$ref" --jq '.content' 2>/dev/null | base64 -d 2>/dev/null
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

if [ -n "$GITHUB_ACTIONS" ] && { [ "$GITHUB_REF" = "refs/heads/main" ] || [ "$GITHUB_REF" = "refs/heads/master" ] || [ "$GITHUB_REF" = "refs/heads/apps" ]; }; then
  deb_name="$(basename "$deb" | sed "s/_amd64/_${distro}_amd64/")"
  mv "$deb" "/tmp/$deb_name"

    if [ -s /tmp/changelog ]; then
      notes_flag="--notes-file /tmp/changelog"
    else
      notes_flag=""
    fi
    if gh release view "$app-$version" --repo "$GITHUB_REPOSITORY" > /dev/null 2>&1; then
      echo "Release $app-$version already exists, skipping"
    else
      gh release create \
        "$app-$version" \
        "/tmp/$deb_name" \
        --title "$app $version" \
        $notes_flag \
        --repo "$GITHUB_REPOSITORY"
    fi

  gh release delete-asset "$app-$version" "$app-$version.tar.gz" --repo "$GITHUB_REPOSITORY" --yes 2>/dev/null || true
  gh release delete-asset "$app-$version" "$app-$version.zip" --repo "$GITHUB_REPOSITORY" --yes 2>/dev/null || true
fi

echo "Done: $app $version"
