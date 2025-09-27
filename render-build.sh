#!/usr/bin/env bash
set -o errexit

echo "Installing Node dependencies..."
npm install

# Puppeteer cache paths
PUPPETEER_CACHE_DIR=$HOME/.cache/puppeteer
XDG_CACHE_HOME=$HOME/.cache

mkdir -p "$PUPPETEER_CACHE_DIR"

# Copy Puppeteer from cache if exists
if [[ -d "$XDG_CACHE_HOME/puppeteer" ]]; then
    echo "...Copying Puppeteer cache from build cache"
    cp -R "$XDG_CACHE_HOME/puppeteer/" "$PUPPETEER_CACHE_DIR"
fi

echo "...Puppeteer cache ready"
