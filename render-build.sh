#!/usr/bin/env bash
set -o errexit  # Exit on error

echo "Installing dependencies..."
npm install

# Uncomment if you have a build step
# npm run build

echo "Setting up Puppeteer cache..."
PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer
mkdir -p $PUPPETEER_CACHE_DIR

echo "Installing Puppeteer Chrome..."
npx puppeteer browsers install chrome

# Store Puppeteer cache in build cache
if [[ ! -d $PUPPETEER_CACHE_DIR ]]; then
  echo "...Copying Puppeteer Cache from Build Cache"
  cp -R /opt/render/project/src/.cache/puppeteer/chrome/ $PUPPETEER_CACHE_DIR
else
  echo "...Storing Puppeteer Cache in Build Cache"
  cp -R $PUPPETEER_CACHE_DIR /opt/render/project/src/.cache/puppeteer/chrome/
fi
