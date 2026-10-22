#!/bin/env bash

if [ $(git status --porcelain | wc -l) -ne "0" ]; then
    echo Please commit you changes before building.
    exit 1
fi

read -p "Version: " version

git tag $version
git push --tags

pnpm install --frozen-lockfile
pnpm build

export CONTAINER_REGISTRY=registry.esek.se/esek
export CONTAINER_TAG=${version:-production}

podman login registry.esek.se
podman compose build
podman compose push fed-admin-frontend

# The Docker Hub images are what the local development stacks run (see the
# frontend compose file in the backend repo), where Minilith lives on
# `localhost:8000` and fed-auth on `localhost:8001`. Rebuild in dev mode so the
# bundle resolves those URLs — exactly what `pnpm dev` serves — instead of the
# production hosts. The production image pushed above is untouched. `docker.io`
# is the registry endpoint used for repositories hosted at hub.docker.com.
NODE_ENV=development pnpm build

export CONTAINER_REGISTRY=docker.io/esekmacapar
podman login docker.io
podman compose build
podman push "docker.io/esekmacapar/fed-admin-frontend:${CONTAINER_TAG}"
podman tag \
    "docker.io/esekmacapar/fed-admin-frontend:${CONTAINER_TAG}" \
    "docker.io/esekmacapar/fed-admin-frontend:latest"
podman push "docker.io/esekmacapar/fed-admin-frontend:latest"
