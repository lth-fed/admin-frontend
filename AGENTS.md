- the human does ui testing, so don't do any smoke tests

- `src/lib/no-autofill.ts` exports a `noAutofill` Svelte action that sets `autocomplete="off"` plus
  vendor opt-outs (`data-1p-ignore`, `data-lpignore`, `data-bwignore`, `data-form-type`) on all
  inputs inside the node. Needed because `@svar-ui/svelte-core` `Combo` does not forward input
  attributes.

## Project Configuration

- **Language**: TypeScript
- **Package Manager**: pnpm
- **Add-ons**: prettier, eslint, tailwindcss, paraglide (translate everything to english (en) &
  swedish (sv)), ai-tools

---

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and
SvelteKit documentation. Here's how to use the available tools effectively:

## Available Svelte MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with
titles, use_cases, and paths. When asked about Svelte or SvelteKit topics, ALWAYS use this tool at
the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections
(especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation
sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions. You MUST use this tool whenever writing
Svelte code before sending it to the user. Keep calling it until no issues or suggestions are
returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code. After completing the code, ask the user
if they want a playground link. Only call this tool after user confirmation and NEVER if code was
written to files in their project.

## My learnings

- Admin pages can remember an "active group" per page with `ActiveGroupPicker` + `src/lib/active-group.ts`
  (`fed-admin:active-group:<pageKey>` in localStorage; default = first directly-administered group by
  path). `/products` uses `pageKey="products"` and lists only the group's products (visibility
  products hidden) via `/admin/groups/{id}/products`; the sidebar has a Products entry.
- Stock is shown for one group at a time: `/stock` is the group view (picker in the header, enable
  tracking inline), `/stock/[groupId]` only remembers the group and redirects to `/stock`. Movement
  editors stay under `/stock/[groupId]/movements/...`.
- New-activity preselection: the remembered `activities` group becomes `sales_target_group_id`,
  which the backend also inserts as an activity host (inviting the creator group is rejected).
  Changing the creator in the wizard updates the remembered group.

- The generated minilith paths include their version (`/v0/...`, `/v1/...`). `apiBaseUrl` is the
  origin only; every `api.*` call must spell out `/v0/...`, and so must hand-built URLs such as the
  OIDC `callback_url_v1` (`${apiBaseUrl}/v0/user/auth-callback/v1`).
- Products replaced ticket kinds: use `AdminProduct` + `/admin/products/{id}` (PUT is an upsert with
  a client-generated UUID). The activity "tickets" tab lists `listActivityProducts`; the
  `activityvisibility` product is the activity's base/visibility product.
- `activity_visibility` products are never listed as tickets; filter with `isVisibilityProduct`.
- Activity capacity is `max_tickets_per_user`; per-product stock is `sales_stock` (`undefined` = not
  automatically managed).
- The activity Tickets tab leads with the base ticket (`activity.base_ticket`, an `activity_visibility`
  product whose `allowed_group_ids` are edited by the "Who can see and buy this activity" picker),
  followed by a stacked capacity bar over the `sales_stock` of base + extra kinds. Extra `ticket`
  kinds are listed after it with "Reserved for: <allowed groups>" (server enforces these stay inside
  the base ticket's groups). Invites (`product_buyers`) are edited on the same tab via
  `list/invite/removeTicketBuyer`. The base placeholder may be **converted** into a real `ticket`
  (kind change on the product), after which it is both `baseTicketProduct` and a `ticket` kind:
  `extraTicketKinds` (regular kinds minus `baseTicketId`) must be used for anything rendered per
  product, or keyed `{#each}` blocks get duplicate keys.
