# Teknologappen admin frontend

Svelte 5 administration UI for Minilith. Authentication uses the fed-auth OpenID Connect
Authorization Code flow with PKCE and the email provider.

## Development

```sh
pnpm install
pnpm dev
```

The defaults point to Minilith on `http://localhost:8000/v0` and fed-auth on
`http://localhost:8001`. Production defaults point to the Teknologappen services. Override them when
needed:

```sh
PUBLIC_MINILITH_API_URL=https://example.test/v0
PUBLIC_OIDC_AUTHORITY=https://auth-api.example.test
PUBLIC_OIDC_CLIENT_ID=teknologappen
```

## Rebuild typed API definitions

Start Minilith on port 8000 and fed-auth on port 8001, then run:

```sh
pnpm api:rebuild
```

This regenerates both OpenAPI TypeScript definitions. The individual commands are
`api:generate:minilith` and `api:generate:auth`.

## Verification

```sh
pnpm check
pnpm lint
pnpm build
```

## Build and push production images

Build the static application first:

```sh
pnpm install --frozen-lockfile
pnpm build
```

Then build and push images:

```sh
export CONTAINER_REGISTRY=registry.esek.se/esek
export CONTAINER_TAG=0.0.1-alpha.1

podman login registry.esek.se
podman compose build
podman compose push fed-admin-frontend
```

No production `.env` file or secrets are needed for build.

## Deploy pushed images

The deployment host only needs `compose.yaml` and an untracked `.env`:

```dotenv
CONTAINER_REGISTRY=registry.esek.se/esek
CONTAINER_TAG=0.0.1-alpha.1

TRAEFIK_NETWORK=traefik
TRAEFIK_ENTRYPOINT=websecure
TRAEFIK_CERT_RESOLVER=letsencrypt
ADMIN_FRONTEND_DOMAIN=admin.teknologappen.se
```

It also needs:

- DNS records for both domains pointing to the host.
- A running Traefik instance with its Docker provider connected to the Podman
  API socket.
- A `websecure` entrypoint and an ACME certificate resolver named
  `letsencrypt` (or matching values in `.env`).
- The external network shared by Traefik and this stack:

```sh
podman network exists traefik || podman network create traefik
```

Pull and start the pushed images without rebuilding:

```sh
podman compose pull
podman compose up -d --no-build
```
