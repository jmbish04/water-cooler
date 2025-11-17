#!/bin/bash

echo "--- Cleaning up old lock files and node_modules ---"
# Remove node_modules and any old lock files
rm -rf node_modules
rm -f package-lock.json
rm -f bun.lockb

echo "--- Correcting @cloudflare/agents package name in package.json ---"
# Replaces "@cloudflare/agents": "..." with "agents": "..."
# Uses the version 0.2.23 mentioned in your new error log
sed -i.bak 's/"@cloudflare\/agents": ".*"/"agents": "^0.2.23"/' package.json

echo "--- Updating import paths in .ts files ---"
# Finds all .ts files and replaces the import statement
find ./src -type f -name "*.ts" -exec sed -i.bak 's/from "@cloudflare\/agents"/from "agents"/g' {} +

echo "--- Installing dependencies with bun ---"
# Use bun to install, which will create a new bun.lockb
bun install

echo "--- Cleaning up backup files ---"
find . -type f -name "*.bak" -delete

echo "✅ Done!"
echo "Please commit the updated 'package.json' and the new 'bun.lockb' to your repository."
