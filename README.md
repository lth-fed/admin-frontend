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

## Frontend structure

Shared UI primitives live in `src/routes/layout.css`. Feature styles are grouped under
`src/lib/styles/` for the app shell, editors, calendar, and group trees; keep each feature's
responsive rules in the same file.

Use `getActivityTicketKinds` to load full ticket details, `ticketKindBody` to build editable ticket
data, and `sortByLocalizedName` for ticket and add-on lists. Transfer defaults are defined in
`transfer-settings.ts`; activity copies preserve their supplied transfer groups.

Use “New …” / “Ny/Nytt …” for creation links and page titles, and “Create …” / “Skapa …” for actions
that create the record. Activity publication status is “Unpublished” / “Opublicerad”; hidden groups
are a separate state. Call add-ons “Tillval” in Swedish. When reviewing translations, read both
catalogues first, then check call sites before merging similar messages. Reuse keys when both the
meaning and UI role match; preserve distinctions such as purchaser versus ticket holder.

## Contextual field and button help

Wrap any field or button in `HelpTip` and provide its translated explanation. The component places a
small accessible question-mark button in the bottom-right corner and opens the explanation on click:

```svelte
<script lang="ts">
	import HelpTip from '$lib/components/HelpTip.svelte';
	import * as m from '$lib/paraglide/messages';
</script>

<HelpTip text={m.example_field_help()}>
	<label class="field"><span>{m.example_field()}</span><input /></label>
</HelpTip>
```

Add the explanation key to both `messages/en.json` and `messages/sv.json`. Keeping the explanation
at the call site makes fields and buttons easy to document incrementally without a separate
registry.

## Build and push images

Run `./build-push.sh 0.0.1-alpha.2`. It pushes two images:

- **Production** (`registry.esek.se/esek`) — built with the production API hosts. This is what the
  deploy host pulls (`compose.yaml`).
- **Development** (`esekmacapar/fed-admin-frontend` on Docker Hub) — built in dev mode, so the
  bundle talks to `localhost:8000` and `localhost:8001`. This is what the local development stacks
  run (see `compose.frontend.yaml` in the backend repo), so devs never have to build locally.

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
- A running Traefik instance with its Docker provider connected to the Podman API socket.
- A `websecure` entrypoint and an ACME certificate resolver named `letsencrypt` (or matching values
  in `.env`).
- The external network shared by Traefik and this stack:

```sh
podman network exists traefik || podman network create traefik
```

Pull and start the pushed images without rebuilding:

```sh
podman compose pull
podman compose up -d --no-build
```
