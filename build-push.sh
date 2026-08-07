#!/bin/env bash

read -p "Version: " version

pnpm install --frozen-lockfile
pnpm build

export CONTAINER_REGISTRY=registry.esek.se/esek
export CONTAINER_TAG=${version:-production}

podman login registry.esek.se
podman compose build
podman compose push fed-admin-frontend
