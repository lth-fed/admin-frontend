<script lang="ts">
	import { resolve } from '$app/paths';
	import { getMe, listActivities, listGroupProducts, listGroupTree } from '$lib/api/admin';
	import { frontendError } from '$lib/api/client';
	import type { AdminProduct, AdminProductKind, BriefActivity, Group } from '$lib/api/types';
	import { administrableGroups, rememberActiveGroup, resolveActiveGroup } from '$lib/active-group';
	import ActiveGroupPicker from '$lib/components/ActiveGroupPicker.svelte';
	import ExportPdf from '$lib/components/ExportPdf.svelte';
	import { dateTime, kronor, localize, sortByLocalizedName } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { isVisibilityProduct } from '$lib/product';
	import { ChevronRight, Plus } from '@lucide/svelte';

	type KindFilter = 'all' | AdminProductKind;

	let groups = $state<Group[]>([]);
	let adminGroupIds = $state<string[]>([]);
	let groupId = $state('');
	let products = $state<AdminProduct[]>([]);
	let loading = $state(true);
	let loadingProducts = $state(false);
	let error = $state<string | null>(null);
	let query = $state('');
	// Items are what most admins come here for; tickets live on their activity.
	let kindFilter = $state<KindFilter>('normal');
	let exportProductId = $state('');
	let exportActivityId = $state('');
	// Activities the group's products are sold on; the export can be narrowed to one of them.
	let activityTitles = $state<BriefActivity[]>([]);
	const activities = $derived(
		activityTitles.filter((activity) =>
			products.some((product) => product.activity_ids.includes(activity.id))
		)
	);
	let requestToken = 0;

	const group = $derived(groups.find((entry) => entry.id === groupId) ?? null);
	const administrable = $derived(administrableGroups(groups, adminGroupIds));
	const kindLabels: Record<AdminProductKind, () => string> = {
		ticket: m.product_kind_ticket,
		normal: m.product_kind_normal,
		questionnaire: m.product_kind_questionnaire,
		activityvisibility: m.product_kind_visibility
	};
	const kindFilters: { id: KindFilter; label: () => string }[] = [
		{ id: 'all', label: m.product_filter_all },
		{ id: 'ticket', label: m.product_kind_ticket },
		{ id: 'normal', label: m.product_kind_normal },
		{ id: 'questionnaire', label: m.product_kind_questionnaire }
	];
	const visibleProducts = $derived(
		sortByLocalizedName(
			products.filter((product) => !isVisibilityProduct(product)),
			(product) => product.name
		).filter((product) => kindFilter === 'all' || product.kind === kindFilter)
	);

	function matchesQuery(product: AdminProduct): boolean {
		const needle = query.trim().toLowerCase();
		if (!needle) return true;
		return [product.name.sv, product.name.en, product.description.sv, product.description.en]
			.filter(Boolean)
			.some((text) => text.toLowerCase().includes(needle));
	}

	const searchResults = $derived(visibleProducts.filter(matchesQuery));

	$effect(() => {
		void load();
	});

	$effect(() => {
		const id = groupId;
		void loadProducts(id);
	});

	async function load(): Promise<void> {
		try {
			const [me, tree] = await Promise.all([getMe(), listGroupTree()]);
			adminGroupIds = me.admin_group_ids;
			groups = tree;
			groupId = resolveActiveGroup('products', tree, me.admin_group_ids);
			rememberActiveGroup('products', groupId);
			if (!groupId) loading = false;
		} catch (cause) {
			error = frontendError(cause);
			loading = false;
		}
	}

	async function loadProducts(id: string): Promise<void> {
		const token = ++requestToken;
		if (!id) {
			products = [];
			loadingProducts = false;
			return;
		}
		loadingProducts = true;
		error = null;
		try {
			const [list, briefs] = await Promise.all([listGroupProducts(id), listActivities()]);
			if (token === requestToken) {
				products = list;
				activityTitles = briefs;
			}
		} catch (cause) {
			if (token === requestToken) error = frontendError(cause);
		} finally {
			if (token === requestToken) {
				loadingProducts = false;
				loading = false;
			}
		}
	}

	function selectGroup(id: string): void {
		groupId = id;
	}

	type SaleState = 'live' | 'upcoming' | 'ended';

	function saleState(product: AdminProduct): SaleState {
		const now = Date.now();
		if (new Date(product.sales_start).getTime() > now) return 'upcoming';
		if (new Date(product.sales_stop).getTime() <= now) return 'ended';
		return 'live';
	}

	function saleStateLabel(state: SaleState): string {
		if (state === 'upcoming') return m.product_status_upcoming();
		if (state === 'ended') return m.product_status_ended();
		return m.product_status_live();
	}
</script>

<svelte:head><title>{m.products()} · {m.app_name()}</title></svelte:head>

<header class="page-header">
	<div>
		<p class="eyebrow">{m.nav_products()}</p>
		<h1>{group ? localize(group.name, group.path) : m.products_title()}</h1>
		<p class="muted">{m.products_description()}</p>
	</div>
	<div class="toolbar">
		<ActiveGroupPicker
			pageKey="products"
			{groups}
			{adminGroupIds}
			value={groupId}
			onchange={selectGroup} />
		<a class="button-link" href={resolve('/products/new')}>
			<Plus size={17} />
			{m.new_product()}
		</a>
	</div>
</header>

{#if loading}
	<div class="center-stage">
		<div class="loader"></div>
		<p>{m.loading()}</p>
	</div>
{:else if administrable.length === 0}
	<p class="empty-state">{m.active_group_none()}</p>
{:else}
	<div class="stack">
		{#if error}<p class="error-banner" role="alert">{error}</p>{/if}

		<section class="card card-pad stack">
			<h2 class="section-title">{m.product_export_title()}</h2>
			<div class="grid-2">
				<label class="field">
					<span>{m.product_export_product()}</span>
					<select bind:value={exportProductId}>
						<option value="">{m.choose()}</option>
						{#each products as product (product.id)}
							<option value={product.id}>{localize(product.name, '')}</option>
						{/each}
					</select>
				</label>
				<label class="field">
					<span>{m.export_scope_activity()}</span>
					<select bind:value={exportActivityId}>
						<option value="">{m.export_scope_all_activities()}</option>
						{#each activities as activity (activity.id)}
							<option value={activity.id}>{localize(activity.title, '')}</option>
						{/each}
					</select>
				</label>
			</div>
			{#if exportProductId}
				<ExportPdf
					kind="sales"
					{groupId}
					activityId={exportActivityId || null}
					productId={exportProductId}
					fileName={`sales-product-${exportProductId}.pdf`} />
			{/if}
		</section>

		<div class="toolbar between product-filters">
			<div class="filter-chips" role="group" aria-label={m.product_kind()}>
				{#each kindFilters as filter (filter.id)}
					<button
						class="filter-chip"
						class:active={kindFilter === filter.id}
						type="button"
						onclick={() => (kindFilter = filter.id)}>
						{filter.label()}
					</button>
				{/each}
			</div>
			<label class="product-search">
				<input
					type="search"
					placeholder={m.product_search()}
					aria-label={m.product_search()}
					bind:value={query} />
			</label>
		</div>

		{#if loadingProducts}
			<div class="center-stage"><div class="loader"></div></div>
		{:else if searchResults.length === 0}
			<p class="empty-state">
				{products.length === 0 ? m.products_empty() : m.product_no_matches()}
			</p>
		{:else}
			<div class="product-grid">
				{#each searchResults as product (product.id)}
					{@const state = saleState(product)}
					<a
						class="card card-pad product-card"
						href={resolve('/products/[id]', { id: product.id })}>
						{#if product.image_url}
							<img
								class="product-card-image"
								src={product.image_url}
								alt={localize(product.name, '')}
								loading="lazy" />
						{/if}
						<div class="product-card-head">
							<strong>{localize(product.name, m.empty_product())}</strong>
							<span class="pill">{kindLabels[product.kind]()}</span>
						</div>
						<p class="product-card-description">
							{localize(product.description, '').trim() || m.empty()}
						</p>
						<div class="product-card-meta">
							<span class="product-price">{kronor(product.price)}</span>
							{#if product.sales_stock !== undefined}
								<span class="muted">
									{m.stock_available()}: {product.sales_stock}
								</span>
							{/if}
							<span class="pill status-{state}">{saleStateLabel(state)}</span>
						</div>
						<div class="product-card-foot">
							<span class="muted">
								{product.activity_ids.length > 0
									? m.product_activity_count({ count: product.activity_ids.length })
									: m.store_product()}
							</span>
							<span class="muted product-window">
								{dateTime(product.sales_start)} – {dateTime(product.sales_stop)}
							</span>
							<ChevronRight size={16} />
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	.product-filters {
		gap: 12px;
	}
	.filter-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.filter-chip {
		border: 1px solid #303531;
		border-radius: 999px;
		padding: 6px 14px;
		background: #161918;
		color: #b8bfba;
		font-size: 0.82rem;
		font-weight: 650;
		cursor: pointer;
	}
	.filter-chip:hover {
		border-color: #3d4a41;
	}
	.filter-chip.active {
		border-color: var(--accent, #7fb98a);
		background: #1d2420;
		color: #e6ece8;
	}
	.product-search input {
		min-width: 16rem;
		border: 1px solid #303531;
		border-radius: 999px;
		padding: 8px 16px;
		background: #161918;
		color: #e6ece8;
	}
	.product-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
		gap: 16px;
	}
	.product-card {
		display: flex;
		flex-direction: column;
		gap: 10px;
		text-decoration: none;
		color: inherit;
		transition:
			border-color 120ms ease,
			transform 120ms ease;
	}
	.product-card:hover {
		border-color: #3d4a41;
		transform: translateY(-1px);
	}
	.product-card-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
	}
	.product-card-image {
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		border-radius: 0.5rem;
	}
	.product-card-description {
		margin: 0;
		color: #969d98;
		font-size: 0.86rem;
		line-height: 1.45;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		min-height: 2.4em;
	}
	.product-card-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}
	.product-price {
		font-weight: 700;
	}
	.product-card-foot {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.78rem;
	}
	.product-window {
		margin-left: auto;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.status-live {
		border: 1px solid #3f6b4b;
		color: #a7d9b3;
	}
	.status-upcoming {
		border: 1px solid #6b613f;
		color: #e0d09a;
	}
	.status-ended {
		border: 1px solid #343a36;
		opacity: 0.65;
	}
	@media (max-width: 700px) {
		.product-search input {
			min-width: 0;
			width: 100%;
		}
	}
</style>
