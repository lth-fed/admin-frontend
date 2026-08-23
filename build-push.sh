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
