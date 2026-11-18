#!/usr/bin/env sh
# Empacota o instalador Windows (NSIS) a partir do Linux usando wine dentro do Docker.
# Pré-requisito: `npm run build` já executado (out/) e binários win32 do libsql presentes.
set -eu
IMAGE=electronuserland/builder:wine
VOLUME=bakasub-ebcache

docker volume inspect "$VOLUME" >/dev/null 2>&1 || docker volume create "$VOLUME" >/dev/null
docker run --rm -v "$VOLUME":/cache alpine chmod 777 /cache

exec docker run --rm \
  -u "$(id -u):$(id -g)" \
  -e HOME=/tmp/home -e ELECTRON_CACHE=/cache/electron -e ELECTRON_BUILDER_CACHE=/cache/builder \
  -v "$PWD":/project -v "$VOLUME":/cache -w /project "$IMAGE" \
  sh -c 'mkdir -p /tmp/home && npx electron-builder --win'
