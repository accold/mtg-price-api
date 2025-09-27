#!/usr/bin/env bash
# exit on error
set -o errexit

# Install dependencies
npm install

echo "Build completed - Puppeteer 19.x will download Chromium automatically"
