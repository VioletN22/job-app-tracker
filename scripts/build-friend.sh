#!/bin/bash
# Build a shareable "friend" copy of aplyd: the LITE edition (barebones Autopilot =
# LinkedIn Easy Apply setup only, no autonomous applier), ad-hoc signed, wrapped in
# a DMG, bundled with the Chrome extension + a README. Does NOT touch /Applications,
# so your own full build stays put.
#
# Apple Silicon (universal) builds break on better-sqlite3, so we ship per-chip
# DMGs and let the friend pick. By default we build BOTH (for "not sure" cases).
#
# Usage:  bash scripts/build-friend.sh                 # both: Apple Silicon + Intel
#         FRIEND_ARCH=arm64 bash scripts/build-friend.sh   # Apple Silicon only
#         FRIEND_ARCH=x64   bash scripts/build-friend.sh   # Intel only
set -e
cd "$(dirname "$0")/.."

OUT="dist-friend"
EDITION_FILE="src/shared/edition.ts"
ARCHES="${FRIEND_ARCH:-arm64 x64}"   # default: build both

# flip to the lite edition (restored on exit no matter what)
cp "$EDITION_FILE" "$EDITION_FILE.bak"
restore() { mv "$EDITION_FILE.bak" "$EDITION_FILE" 2>/dev/null || true; }
trap restore EXIT
printf 'export const LITE = true;\n' > "$EDITION_FILE"

rm -rf "$OUT"; mkdir -p "$OUT"
npm run build   # compile once; the .app is the same code for both arches

build_one() {
  local arch="$1" flag label
  case "$arch" in
    arm64) flag="--arm64"; label="apple-silicon" ;;
    x64)   flag="--x64";   label="intel" ;;
    *) echo "Unknown arch '$arch' (use arm64 | x64)"; return 1 ;;
  esac
  echo "==> Packaging $arch ($label)…"
  rm -rf release/mac release/mac-arm64 2>/dev/null || true
  npx electron-builder --config electron-builder.friend.js --mac dir $flag
  local app; app="$(ls -d release/mac*/aplyd.app 2>/dev/null | head -1)"
  [ -d "$app" ] || { echo "ERROR: $arch app not found"; return 1; }
  # ad-hoc sign inside-out (REQUIRED or the GUI never launches on Apple Silicon)
  codesign --force --sign - --timestamp=none "$app"/Contents/Frameworks/*.framework 2>/dev/null || true
  codesign --force --sign - --timestamp=none "$app"/Contents/Frameworks/*.app 2>/dev/null || true
  codesign --force --sign - --timestamp=none "$app"
  # wrap in a drag-to-Applications DMG
  local stage; stage="$(mktemp -d)"
  cp -R "$app" "$stage/"; ln -s /Applications "$stage/Applications"
  hdiutil create -volname "aplyd" -srcfolder "$stage" -ov -format UDZO "$OUT/aplyd-$label.dmg" >/dev/null
  rm -rf "$stage"
  echo "    → $OUT/aplyd-$label.dmg"
}

for a in $ARCHES; do build_one "$a"; done

# bundle the extension + README
cp -R extension "$OUT/aplyd-chrome-extension"
cp scripts/FRIEND_README.md "$OUT/README.md" 2>/dev/null || true

echo ""
echo "==> Done. Hand your friend the whole '$OUT/' folder:"
ls -1 "$OUT" | sed 's/^/    - /'
echo "    (Apple Silicon = M1/M2/M3/M4 → aplyd-apple-silicon.dmg;  older Intel Mac → aplyd-intel.dmg)"
