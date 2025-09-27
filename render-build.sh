#!/usr/bin/env bash
# exit on error
set -o errexit

# Install dependencies
npm install

# Install Chrome
npx puppeteer browsers install chrome

# Debug: Show where Chrome was installed
echo "Chrome installation locations:"
find /opt/render -name chrome -type f 2>/dev/null || echo "Chrome executable not found"

echo "Build completed!"
