#!/usr/bin/env sh
# Renders icons/src/*.svg to the PNG sizes the manifest uses.
# Each small size has its own hand-fitted SVG; only 128 comes from the master.
# Needs rsvg-convert (librsvg).
set -eu
cd "$(dirname "$0")/../icons"
for size in 16 32 48; do
	rsvg-convert -w "$size" -h "$size" "src/icon-$size.svg" -o "icon-$size.png"
done
rsvg-convert -w 128 -h 128 src/icon.svg -o icon-128.png
echo "icons: 16 32 48 128"
