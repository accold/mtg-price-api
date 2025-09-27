#!/usr/bin/env bash
set -o errexit

echo "Installing Node dependencies..."
npm install

# Puppeteer cache paths
PUPPETEER_CACHE_DIR=$HOME/.cache/puppeteer
XDG_CACHE_HOME=$HOME/.cache

mkdir -p "$PUPPETEER_CACHE_DIR"

# Only copy if source exists AND is different from destination
if [[ -d "$XDG_CACHE_HOME/puppeteer" && "$XDG_CACHE_HOME/puppeteer" != "$PUPPETEER_CACHE_DIR" ]]; then
    echo "...Copying Puppeteer cache from build cache"
    cp -R "$XDG_CACHE_HOME/puppeteer/" "$PUPPETEER_CACHE_DIR"
else
    echo "...Puppeteer cache already exists or source same as destination"
fi

echo "...Puppeteer cache ready"
