#!/bin/bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  printf 'Usage: bash scripts/verify-macos.sh <dmg-path> <architecture> <version>\n' >&2
  exit 2
fi

dmg_path="$1"
expected_arch="$2"
expected_version="$3"
mount_dir="$(mktemp -d "${TMPDIR:-/tmp}/qrcode-verify.XXXXXX")"
mounted=0

cleanup() {
  if [ "$mounted" -eq 1 ]; then
    hdiutil detach "$mount_dir" -quiet
  fi
  rmdir "$mount_dir"
}
trap cleanup EXIT

hdiutil verify "$dmg_path" -quiet
hdiutil attach "$dmg_path" -readonly -nobrowse -noautoopen -mountpoint "$mount_dir" -quiet
mounted=1

apps=("$mount_dir"/*.app)
if [ "${#apps[@]}" -ne 1 ] || [ ! -d "${apps[0]}" ]; then
  printf 'Expected exactly one application in the DMG.\n' >&2
  exit 1
fi
app_path="${apps[0]}"
plist_path="$app_path/Contents/Info.plist"
actual_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist_path")"
build_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$plist_path")"
executable="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$plist_path")"
actual_arch="$(lipo -archs "$app_path/Contents/MacOS/$executable")"

if [ "$actual_version" != "$expected_version" ] || [ "$build_version" != "$expected_version" ]; then
  printf 'Version mismatch: expected %s, found %s (%s).\n' "$expected_version" "$actual_version" "$build_version" >&2
  exit 1
fi
if [ "$actual_arch" != "$expected_arch" ]; then
  printf 'Architecture mismatch: expected %s, found %s.\n' "$expected_arch" "$actual_arch" >&2
  exit 1
fi
if [ ! -f "$app_path/Contents/_CodeSignature/CodeResources" ]; then
  printf 'Application bundle is missing its sealed resource signature.\n' >&2
  exit 1
fi

codesign --verify --deep --strict --verbose=2 "$app_path"
codesign --display --verbose=2 "$app_path"
printf 'Verified DMG, complete application signature, version %s, architecture %s.\n' "$actual_version" "$actual_arch"
