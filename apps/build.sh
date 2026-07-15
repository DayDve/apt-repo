#!/usr/bin/env bash
set -e

app="${1:?Usage: build.sh <app> [current_version] [distro]}"
current_version="$2"
distro="${3:-noble}"
dir="$(cd "$(dirname "$0")" && pwd)/$app"

[ -d "$dir" ] || { echo "App $app not found"; exit 1; }
[ -f "$dir/Dockerfile" ] || { echo "Dockerfile not found for $app"; exit 1; }

if [ -f "$dir/get_version" ]; then
  bash "$dir/get_version" "$current_version" > /tmp/version_info
  version="$(sed -n '1s/^version=//p' /tmp/version_info)"
  source_url="$(sed -n '2s/^source=//p' /tmp/version_info)"
  tail -n +4 /tmp/version_info > /tmp/changelog 2>/dev/null || true
  [ -z "$version" ] && { echo "Failed to parse version"; exit 1; }
  [ -z "$source_url" ] && { echo "Failed to parse source URL"; exit 1; }
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

  jq -n --arg source "$source_url" --arg app "$app" --arg version "$version" \
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
