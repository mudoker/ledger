#!/usr/bin/env bash
# scripts/bump-version.sh
# Automatically increments the app version and build number across:
# 1. package.json
# 2. src/constants/app-info.ts (APP_METADATA.version, APP_METADATA.build, APP_METADATA.releaseDate)
# 3. public/sw.js (SW_VERSION)
#
# Usage:
#   scripts/bump-version.sh [patch|minor|major]

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
PACKAGE_JSON="$REPO_ROOT/package.json"
APP_INFO="$REPO_ROOT/src/constants/app-info.ts"
SW_FILE="$REPO_ROOT/public/sw.js"
BUMP_KIND="${1:-patch}"

# 1. Read current version from package.json or app-info.ts
CURRENT_VER="1.0.0"
if [[ -f "$APP_INFO" ]]; then
  EXTRACTED=$(grep -oE "version: '[0-9]+\.[0-9]+\.[0-9]+'" "$APP_INFO" | head -1 | grep -oE "[0-9]+\.[0-9]+\.[0-9]+" || true)
  if [[ -n "$EXTRACTED" ]]; then
    CURRENT_VER="$EXTRACTED"
  fi
fi

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VER"

case "$BUMP_KIND" in
  major)
    NEXT_VER="$((MAJOR + 1)).0.0"
    ;;
  minor)
    NEXT_VER="${MAJOR}.$((MINOR + 1)).0"
    ;;
  patch|*)
    NEXT_VER="${MAJOR}.${MINOR}.$((PATCH + 1))"
    ;;
esac

# Read and increment build number
CURRENT_BUILD="100"
if [[ -f "$APP_INFO" ]]; then
  EXTRACTED_BUILD=$(grep -oE "build: '[0-9]+'" "$APP_INFO" | head -1 | grep -oE "[0-9]+" || true)
  if [[ -n "$EXTRACTED_BUILD" ]]; then
    CURRENT_BUILD="$EXTRACTED_BUILD"
  fi
fi
NEXT_BUILD="$((CURRENT_BUILD + 1))"
TODAY="$(date +%Y-%m-%d)"

# Update src/constants/app-info.ts
if [[ -f "$APP_INFO" ]]; then
  sed -i "s/version: '[0-9]\+\.[0-9]\+\.[0-9]\+'/version: '${NEXT_VER}'/" "$APP_INFO"
  sed -i "s/build: '[0-9]\+'/build: '${NEXT_BUILD}'/" "$APP_INFO"
  sed -i "s/releaseDate: '[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}'/releaseDate: '${TODAY}'/" "$APP_INFO"
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git add "$APP_INFO"
  fi
fi

# Update package.json
if [[ -f "$PACKAGE_JSON" ]]; then
  sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"${NEXT_VER}\"/" "$PACKAGE_JSON"
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git add "$PACKAGE_JSON"
  fi
fi

# Update public/sw.js
if [[ -f "$SW_FILE" ]]; then
  sed -i "s/SW_VERSION = \"[^\"]*\"/SW_VERSION = \"${NEXT_VER}\"/" "$SW_FILE"
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git add "$SW_FILE"
  fi
fi

echo "🚀 App version bumped: v${CURRENT_VER} (build ${CURRENT_BUILD}) → v${NEXT_VER} (build ${NEXT_BUILD}) [${TODAY}]"
