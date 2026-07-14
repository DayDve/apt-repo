#!/usr/bin/env bash
set -e

app="${1:?Usage: build.sh <app>}"
dir="$(cd "$(dirname "$0")" && pwd)/$app"

[ -d "$dir" ] || { echo "App $app not found"; exit 1; }
[ -f "$dir/Dockerfile" ] || { echo "Dockerfile not found for $app"; exit 1; }

if [ -f "$dir/get_version" ]; then
  bash "$dir/get_version" > /tmp/version_info
  version="$(sed -n '1s/^version=//p' /tmp/version_info)"
  tail -n +3 /tmp/version_info > /tmp/changelog
  [ -z "$version" ] && { echo "Failed to parse version"; exit 1; }
else
  echo "No get_version for $app"; exit 1
fi

if [ -n "$GITHUB_ACTIONS" ]; then
  owner_info="$(gh api users/"$GITHUB_REPOSITORY_OWNER")"
  DEBFULLNAME="$(echo "$owner_info" | jq -r '.name // empty')"
  DEBEMAIL="$(echo "$owner_info" | jq -r '.email // empty')"
fi
DEBFULLNAME="${DEBFULLNAME:-$GITHUB_REPOSITORY_OWNER}"
DEBEMAIL="${DEBEMAIL:-$GITHUB_REPOSITORY_OWNER@users.noreply.github.com}"

docker buildx build \
  --output type=local,dest=/tmp/deb-out \
  --build-arg "DEBFULLNAME=$DEBFULLNAME" \
  --build-arg "DEBEMAIL=$DEBEMAIL" \
  -f "$dir/Dockerfile" "$dir"

deb="$(ls /tmp/deb-out/*.deb 2>/dev/null | head -1)"
[ -z "$deb" ] && { echo "No .deb produced"; exit 1; }

if [ -n "$GITHUB_ACTIONS" ] && { [ "$GITHUB_REF" = "refs/heads/main" ] || [ "$GITHUB_REF" = "refs/heads/master" ]; }; then
  gh release create \
    "$app-$version" \
    "$deb" \
    --title "$app $version" \
    --notes-file /tmp/changelog \
    --repo "$GITHUB_REPOSITORY"
fi

echo "Done: $app $version"
