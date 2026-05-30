#!/usr/bin/env bash
#
# Download the Noto source fonts listed in tools/sources.txt into tools/sources/.
# Tolerant of individual 404s (skips and logs). tools/sources/ is .gitignored —
# only the committed pipeline outputs (frontend/src/fonts/gen/, coverage.rs,
# plan.json) matter for the running site; these sources are just to regenerate.
#
# Usage (from anywhere):  bash tools/fetch_sources.sh
set -u

here="$(cd "$(dirname "$0")" && pwd)"
dest="$here/sources"
mkdir -p "$dest"
cd "$dest" || exit 1

# -g (globoff) so the variable-font filenames with [] are not treated as globs;
# -O saves each under its remote basename.
xargs -P 16 -I{} bash -c \
  'curl -g --fail -sSL --max-time 180 -O "$1" || echo "FAIL $1" >&2' _ {} \
  < "$here/sources.txt"

echo "downloaded $(ls -1 "$dest" | wc -l) fonts into $dest"
