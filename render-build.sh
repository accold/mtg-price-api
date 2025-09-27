#!/usr/bin/env bash
set -o errexit

echo "Installing dependencies..."
npm install

echo "Installing Puppeteer Chrome..."
npx puppeteer install chrome

echo "Build complete ✅"
