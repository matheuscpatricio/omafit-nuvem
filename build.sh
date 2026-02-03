#!/usr/bin/env bash
set -e
# Netlify: garantir Node/npm no PATH (nvm)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
# Usar Node 20 se .nvmrc existir
[ -f .nvmrc ] && nvm use
npm install --legacy-peer-deps
npx tsup
node copy-assets.js
