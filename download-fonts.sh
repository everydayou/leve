#!/bin/bash
# Download Outfit font files from Google Fonts CDN
# Run this script once to fetch the fonts, then commit them to the repo

set -e

FONTS_DIR="public/fonts"
mkdir -p "$FONTS_DIR"

echo "Downloading Outfit font files..."

# These are the exact URLs from Google Fonts for Outfit woff2 files
# weights: 400, 500, 600, 700

curl -L -o "$FONTS_DIR/outfit-400.woff2" \
  "https://fonts.gstatic.com/s/outfit/v10/QGYvz_wNahGAdqQ43RhVcHhQ9OVXt0bzbAUjxUIo.woff2"

curl -L -o "$FONTS_DIR/outfit-500.woff2" \
  "https://fonts.gstatic.com/s/outfit/v10/QGYvz_wNahGAdqQ43RhVcP-S9OVXt0bzbAUjxUIo.woff2"

curl -L -o "$FONTS_DIR/outfit-600.woff2" \
  "https://fonts.gstatic.com/s/outfit/v10/QGYvz_wNahGAdqQ43RhVcIuW9OVXt0bzbAUjxUIo.woff2"

curl -L -o "$FONTS_DIR/outfit-700.woff2" \
  "https://fonts.gstatic.com/s/outfit/v10/QGYvz_wNahGAdqQ43RhVcJCX9OVXt0bzbAUjxUIo.woff2"

echo "✓ Fonts downloaded to $FONTS_DIR"
echo "Next: commit these files to git and rebuild the app"
