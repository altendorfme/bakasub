#!/usr/bin/env bash
# Regenerates the raster icons from resources/icon.svg (the only source of truth).
#   resources/icon.png  512 px, window icon on Linux (Electron cannot read SVG)
#   build/icon.png      1024 px, electron-builder (Linux AppImage, macOS)
#   build/icon.ico      16–256 px, electron-builder (Windows)
# Needs rsvg-convert (librsvg) and ImageMagick (`magick`).
set -euo pipefail
cd "$(dirname "$0")/.."
src=resources/icon.svg
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p build
rsvg-convert -w 512 -h 512 "$src" -o resources/icon.png
rsvg-convert -w 1024 -h 1024 "$src" -o build/icon.png
sizes=(16 24 32 48 64 128 256)
for s in "${sizes[@]}"; do rsvg-convert -w "$s" -h "$s" "$src" -o "$tmp/$s.png"; done
pngs=()
for s in "${sizes[@]}"; do pngs+=("$tmp/$s.png"); done
magick "${pngs[@]}" build/icon.ico
echo "icons regenerated from $src"
