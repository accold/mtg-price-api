#!/usr/bin/env bash
set -e

# Tell Playwright to use a project-local cache path
export PLAYWRIGHT_BROWSERS_PATH=/opt/render/project/.playwright-browsers
mkdir -p $PLAYWRIGHT_BROWSERS_PATH

# Install Chromium with system deps
npx playwright install chromium --with-deps
