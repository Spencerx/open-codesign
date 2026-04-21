#!/usr/bin/env bash
# Populate SHA256 placeholders in every distribution-channel manifest from the
# artifacts attached to a published GitHub Release.
#
# Usage:
#   ./packaging/update-shas.sh                  # uses apps/desktop/package.json version
#   ./packaging/update-shas.sh 0.1.0            # override version
#   ./packaging/update-shas.sh 0.1.0 local/dir  # hash local files in local/dir instead of downloading
#
# After a successful `gh release view vX.Y.Z` run this and commit the diffs.

set -euo pipefail

VERSION="${1:-$(node -p "require('./apps/desktop/package.json').version" 2>/dev/null || echo '0.1.0')}"
LOCAL_DIR="${2:-}"

REPO="OpenCoworkAI/open-codesign"
REL_URL_BASE="https://github.com/${REPO}/releases/download/v${VERSION}"

# electron-builder's default artifact names. The NSIS target with
# `arch: [x64, arm64]` emits ONE multi-arch installer (not per-arch),
# so we only hash a single Windows file. GitHub Releases collapses
# whitespace in the name to dots.
MAC_ARM64_DMG="open-codesign-${VERSION}-arm64.dmg"
MAC_X64_DMG="open-codesign-${VERSION}.dmg"
WIN_EXE="open-codesign.Setup.${VERSION}.exe"

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

fetch_sha() {
  local file="$1"
  local out="$tmpdir/$file"
  if [[ -n "$LOCAL_DIR" && -f "$LOCAL_DIR/$file" ]]; then
    cp "$LOCAL_DIR/$file" "$out"
  else
    local url="${REL_URL_BASE}/${file}"
    echo "  downloading $url" >&2
    curl -fsSL -o "$out" "$url"
  fi
  shasum -a 256 "$out" | awk '{print $1}'
}

update_placeholder() {
  local file="$1" ; local placeholder="$2" ; local sha="$3"
  # Perl for portable in-place replace that works on both macOS and Linux.
  perl -pi -e "s/\\Q${placeholder}\\E/${sha}/g" "$file"
}

echo "Version: v${VERSION}"
echo ""
echo "Computing SHA256s…"
mac_arm_sha=$(fetch_sha "$MAC_ARM64_DMG")
mac_x64_sha=$(fetch_sha "$MAC_X64_DMG")
win_sha=$(fetch_sha "$WIN_EXE")
echo "  mac arm64 : $mac_arm_sha"
echo "  mac x64   : $mac_x64_sha"
echo "  win multi : $win_sha"
echo ""

echo "Homebrew cask…"
cask="packaging/homebrew/Casks/open-codesign.rb"
perl -pi -e "s/version \"[0-9.]+\"/version \"${VERSION}\"/" "$cask"
update_placeholder "$cask" "REPLACE_WITH_ARM64_SHA256" "$mac_arm_sha"
update_placeholder "$cask" "REPLACE_WITH_X64_SHA256"   "$mac_x64_sha"

echo "winget manifests…"
winget_dir="packaging/winget/manifests/o/OpenCoworkAI/open-codesign/${VERSION}"
# If the user bumped VERSION without renaming the directory, guide them.
if [[ ! -d "$winget_dir" ]]; then
  echo "  note: $winget_dir does not exist yet. Copy the previous version's"
  echo "        directory and rerun — this script only updates SHAs, not tree."
else
  for f in "$winget_dir"/*.yaml; do
    perl -pi -e "s/PackageVersion: [0-9.]+/PackageVersion: ${VERSION}/" "$f"
  done
  installer="$winget_dir/OpenCoworkAI.open-codesign.installer.yaml"
  update_placeholder "$installer" "REPLACE_WITH_WIN_SHA256" "$win_sha"
  # Keep InstallerUrl in sync with VERSION.
  perl -pi -e "s/v[0-9.]+\/open-codesign\.Setup\.[0-9.]+\.exe/v${VERSION}\/open-codesign.Setup.${VERSION}.exe/g" "$installer"
fi

echo "scoop manifest…"
scoop="packaging/scoop/bucket/open-codesign.json"
perl -pi -e "s/\"version\": \"[0-9.]+\"/\"version\": \"${VERSION}\"/" "$scoop"
perl -pi -e "s/v[0-9.]+\/open-codesign\.Setup\.[0-9.]+\.exe/v${VERSION}\/open-codesign.Setup.${VERSION}.exe/g" "$scoop"
update_placeholder "$scoop" "REPLACE_WITH_WIN_SHA256" "$win_sha"

echo ""
echo "Done. Review with git diff packaging/, then commit + mirror to the"
echo "downstream tap/bucket/winget-pkgs repos (see packaging/README.md)."
