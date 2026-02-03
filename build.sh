#!/usr/bin/env bash
set -e
# Carregar nvm no Netlify (PATH do Node/npm)
[ -s "$HOME/.nvm/nvm.sh" ] && \. "$HOME/.nvm/nvm.sh"
npm install --legacy-peer-deps
npx tsup
node copy-assets.js
