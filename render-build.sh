#!/usr/bin/env bash
set -o errexit  # Exit on error

echo "Installing dependencies..."
npm install

# Uncomment if you have a build step
# npm run build

echo "Setting up Puppeteer cache..."
PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer

# Ensure the cache directories exist
mkdir -p "$PUPPETEER_CACHE_DIR/chrome"
mkdir -p /opt/render/project/src/.cache/puppeteer/chrome

echo "Installing Puppeteer Chrome..."
PUPPETEER_CACHE_DIR="$PUPPETEER_CACHE_DIR" npx puppeteer install chrome

# Safely copy Puppeteer cache to/from build cache
if [[ ! -d /opt/render/project/src/.cache/puppeteer/chrome || -z "$(ls -A /opt/render/project/src/.cache/puppeteer/chrome)" ]]; then
    echo "...Copying Puppeteer Cache from Build Cache"
    if [[ -d "$PUPPETEER_CACHE_DIR/chrome" ]]; then
        cp -R "$PUPPETEER_CACHE_DIR/chrome/" /opt/render/project/src/.cache/puppeteer/chrome/
    fi
else
    echo "...Storing Puppeteer Cache in Build Cache"
    cp -R /opt/render/project/src/.cache/puppeteer/chrome/ "$PUPPETEER_CACHE_DIR/chrome/"
fi

echo "Build complete ✅"
