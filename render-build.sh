#!/usr/bin/env bash
# exit on error
set -o errexit

# Install dependencies
npm install

# Set the Puppeteer cache directory environment variable
export PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer
mkdir -p $PUPPETEER_CACHE_DIR

# Install Chrome using Puppeteer
npx puppeteer browsers install chrome --path $PUPPETEER_CACHE_DIR

# List what was installed for debugging
echo "Contents of cache directory:"
find $PUPPETEER_CACHE_DIR -type f -name "chrome*" 2>/dev/null || echo "No chrome files found"

echo "Build completed successfully!"
