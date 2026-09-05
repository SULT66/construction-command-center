#!/bin/sh
set -eu

HERE="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
OUT="${1:-$HERE/extracted}"
ARCHIVE="$HERE/safestart-runtime-p12.tar.gz"
EXPECTED_SHA256="f04f53b238aa3a44562e1df8b65845a0ea8068432d2a7af30f5fe91f3f2571d9"

rm -f "$ARCHIVE"
cat "$HERE"/part-*.b64 | tr -d '\n\r' | base64 -d > "$ARCHIVE"

ACTUAL_SHA256="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
if [ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]; then
  echo "ERROR: SHA-256 mismatch" >&2
  echo "expected: $EXPECTED_SHA256" >&2
  echo "actual:   $ACTUAL_SHA256" >&2
  exit 1
fi

rm -rf "$OUT"
mkdir -p "$OUT"
tar -xzf "$ARCHIVE" -C "$OUT"

echo "SafeStart P12 runtime verified and extracted to: $OUT"
echo "SHA-256: $ACTUAL_SHA256"
