<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		getMe,
		getStockHistory,
		listGroupProducts,
		listGroupTree,
		listStock,
		listStockTransactions,
		setStockTracking,
		startStockInventory
	} from '$lib/api/admin';
	import { frontendError } from '$lib/api/client';
	import type {
		AdminProduct,
		Group,
		StockLine,
		StockPoint,
		StockTransaction
	} from '$lib/api/types';
	import { administrableGroups, rememberActiveGroup, resolveActiveGroup } from '$lib/active-group';
	import ActiveGroupPicker from '$lib/components/ActiveGroupPicker.svelte';
	import LineChart from '$lib/components/LineChart.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import { dateTime, kronor, localize, sortByLocalizedName } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { toasts } from '$lib/toasts.svelte';
	import { Switch } from '@svar-ui/svelte-core';
	import { SvelteMap } from 'svelte/reactivity';
	import { onMount } from 'svelte';

	let groups = $state<Group[]>([]);
	let adminGroupIds = $state<string[]>([]);
	let groupId = $state('');
	let lines = $state<StockLine[]>([]);
	let products = $state<AdminProduct[]>([]);
	let transactions = $state<StockTransaction[]>([]);
	let showSales = $state(false);
	let showDiscontinued = $state(false);
	let loading = $state(true);
	let loadingStock = $state(false);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let requestToken = 0;
	let graphProductId = $state('');
	let graphPoints = $state<StockPoint[]>([]);
	let loadingGraph = $state(false);

	const administrable = $derived(administrableGroups(groups, adminGroupIds));
	const group = $derived(groups.find((entry) => entry.id === groupId) ?? null);
	const tracking = $derived(group?.stock_tracking === true);
	const normalProducts = $derived(
		new Map(
			products
				.filter((product) => product.kind === 'normal')
				.map((product) => [product.id, product])
		)
	);
	const sortedLines = $derived(
		sortByLocalizedName(
			lines.filter(
				(line) =>
					normalProducts.has(line.product_id) &&
					(showDiscontinued || isOnSale(normalProducts.get(line.product_id)))
			),
			(line) => line.name
		)
	);
	const itemLines = $derived(lines.filter((line) => normalProducts.has(line.product_id)));
	const stockValue = $derived(
		itemLines.reduce((sum, line) => sum + line.stock_price * Math.max(line.stock_real, 0), 0)
	);
	const lowStock = $derived(
		itemLines.filter((line) => line.sales_stock !== undefined && line.sales_stock <= 5).length
	);
	const productOptions = $derived(
		sortedLines.map((line) => ({ id: line.product_id, label: localize(line.name, '') }))
	);
	/** Taken out, sold and put back per product, across every movement of the group. */
	const movementTotals = $derived.by(() => {
		const totals = new SvelteMap<string, { takeOut: number; sold: number; putBack: number }>();
		for (const transaction of transactions) {
			for (const record of transaction.records) {
				const entry = totals.get(record.product_id) ?? { takeOut: 0, sold: 0, putBack: 0 };
				if (record.kind === 'take-out') entry.takeOut += record.amount;
				if (record.kind === 'put-back') entry.putBack += record.amount;
				if (record.kind === 'sales') entry.sold += record.amount;
				if (record.kind === 'sales-refund') entry.sold -= record.amount;
				totals.set(record.product_id, entry);
			}
		}
		return totals;
	});
	const graphProduct = $derived(
		itemLines.find((line) => line.product_id === graphProductId) ?? itemLines[0]
	);
	const graphSeries = $derived(
		graphPoints.map((point) => ({ time: point.time, value: point.stock_real }))
	);
	const visibleTransactions = $derived(
		showSales
			? transactions
			: transactions.filter(
					(transaction) =>
						transaction.records.length !== 1 || transaction.records[0]?.kind !== 'sales'
				)
	);

	onMount(async () => {
		try {
			const [me, tree] = await Promise.all([getMe(), listGroupTree()]);
			adminGroupIds = me.admin_group_ids;
			groups = tree;
			groupId = resolveActiveGroup('stock', tree, me.admin_group_ids);
			rememberActiveGroup('stock', groupId);
			// Stock is only fetched when tracking is enabled; otherwise nothing else clears `loading`.
			if (!tree.some((entry) => entry.id === groupId && entry.stock_tracking === true))
				loading = false;
		} catch (cause) {
			error = frontendError(cause);
			loading = false;
		}
	});

	$effect(() => {
		const id = groupId;
		if (tracking) void loadStock(id);
	});

	$effect(() => {
		const productId = graphProduct?.product_id;
		if (!graphProductId && productId) graphProductId = productId;
		if (tracking && productId) void loadGraph(productId);
	});

	async function loadGraph(productId: string): Promise<void> {
		loadingGraph = true;
		try {
			graphPoints = await getStockHistory(groupId, productId);
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			loadingGraph = false;
		}
	}

	async function loadStock(id: string): Promise<void> {
		const token = ++requestToken;
		loadingStock = true;
		error = null;
		try {
			const [stock, movements, groupProducts] = await Promise.all([
				listStock(id),
				listStockTransactions(id),
				listGroupProducts(id)
			]);
			if (token !== requestToken) return;
			lines = stock;
			transactions = movements;
			products = groupProducts;
		} catch (cause) {
			if (token === requestToken) error = frontendError(cause);
		} finally {
			if (token === requestToken) {
				loadingStock = false;
				loading = false;
			}
		}
	}

	function isOnSale(product: AdminProduct | undefined): boolean {
		if (!product) return false;
		const now = Date.now();
		return (
			new Date(product.sales_start).getTime() <= now && now < new Date(product.sales_stop).getTime()
		);
	}

	function selectGroup(id: string): void {
		requestToken++;
		loadingStock = false;
		groupId = id;
		lines = [];
		products = [];
		transactions = [];
		loading = false;
	}

	async function enable(): Promise<void> {
		if (!group) return;
		busy = true;
		error = null;
		try {
			await setStockTracking(group.id, true);
			groups = groups.map((entry) =>
				entry.id === group.id ? { ...entry, stock_tracking: true } : entry
			);
			toasts.show('success', m.backend_success());
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			busy = false;
		}
	}

	/**
	 * Books every product down to zero in one `inventory` movement and opens a stocktake, so what is
	 * counted on the shelves becomes the new stock level.
	 */
	async function startInventory(): Promise<void> {
		if (!groupId || !confirm(m.stock_inventory_start_confirm())) return;
		busy = true;
		error = null;
		try {
			const resetId = await startStockInventory(groupId);
			if (resetId) toasts.show('success', m.stock_inventory_reset_done());
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- the route is resolved, the query is appended
			await goto(`${resolve('/stock/[groupId]/movements/new', { groupId })}?mode=stocktake`);
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>{m.stock()} · {m.app_name()}</title></svelte:head>

<header class="page-header">
	<div>
		<p class="eyebrow">{m.nav_stock()}</p>
		<h1>{group ? localize(group.name, group.path) : m.stock()}</h1>
	</div>
	<div class="toolbar">
		<ActiveGroupPicker
			pageKey="stock"
			{groups}
			{adminGroupIds}
			value={groupId}
			onchange={selectGroup} />
		{#if tracking}
			<button
				class="button-link secondary"
				type="button"
				disabled={busy}
				title={m.stock_inventory_start_help()}
				onclick={() => void startInventory()}>{m.stock_inventory_start()}</button>
			<a
				class="button-link secondary"
				href="{resolve('/stock/[groupId]/movements/new', { groupId })}?mode=procurement">
				{m.new_stock_purchase()}
			</a>
			<a class="button-link" href={resolve('/stock/[groupId]/movements/new', { groupId })}>
				{m.new_stock_transaction()}
			</a>
		{/if}
	</div>
</header>

{#if loading}
	<div class="center-stage">
		<div class="loader"></div>
		<p>{m.loading()}</p>
	</div>
{:else if administrable.length === 0}
	<p class="empty-state">{m.stock_no_group()}</p>
{:else}
	<div class="stack">
		{#if error}<p class="error-banner" role="alert">{error}</p>{/if}

		{#if !tracking}
			<section class="card card-pad stack">
				<h2 class="section-title">{m.stock_enable_tracking()}</h2>
				<p class="muted">{m.stock_enable_description()}</p>
				<div>
					<button class="button-link" type="button" disabled={busy} onclick={() => void enable()}>
						{busy ? m.saving() : m.stock_enable_button()}
					</button>
				</div>
			</section>
		{:else if loadingStock && lines.length === 0}
			<div class="center-stage"><div class="loader"></div></div>
		{:else}
			<div class="stock-summary">
				<div class="card card-pad">
					<span class="muted">{m.stock_products()}</span>
					<strong>{itemLines.length}</strong>
				</div>
				<div class="card card-pad">
					<span class="muted">{m.stock_value()}</span>
					<strong>{kronor(stockValue)}</strong>
				</div>
				<div class="card card-pad">
					<span class="muted">{m.stock_low()}</span>
					<strong>{lowStock}</strong>
				</div>
			</div>

			<section class="card card-pad stack">
				<div class="toolbar">
					<h2 class="section-title">{m.stock_levels()}</h2>
					<label class="switch-field">
						<Switch value={showDiscontinued} onchange={({ value }) => (showDiscontinued = value)} />
						<span>{m.stock_show_discontinued()}</span>
					</label>
				</div>
				{#if sortedLines.length === 0}
					<p class="empty-state">{m.empty()}</p>
				{:else}
					<table class="data-table">
						<thead>
							<tr>
								<th>{m.product()}</th>
								<th>{m.stock_available()}</th>
								<th>{m.stock_real()}</th>
								<th>{m.stock_unit()}</th>
								<th>{m.stock_value()}</th>
							</tr>
						</thead>
						<tbody>
							{#each sortedLines as line (line.product_id)}
								{@const totals = movementTotals.get(line.product_id)}
								<tr>
									<td>
										<a href={resolve('/products/[id]', { id: line.product_id })}
											>{localize(line.name, '')}</a>
										{#if totals}
											<span class="movement-totals">
												{m.stock_take_out()}
												{totals.takeOut} · {m.stock_sales()}
												{totals.sold} · {m.stock_put_back()}
												{totals.putBack}
											</span>
										{/if}
									</td>
									<td>{line.sales_stock ?? '∞'}</td>
									<td>{line.stock_real}</td>
									<td>{line.stock_unit}</td>
									<td>{kronor(line.stock_price * Math.max(line.stock_real, 0))}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</section>

			<section class="card card-pad stack">
				<div class="toolbar">
					<h2 class="section-title">{m.stock_transactions()}</h2>
					<label class="switch-field">
						<Switch value={showSales} onchange={({ value }) => (showSales = value)} />
						<span>{m.stock_show_sales()}</span>
					</label>
				</div>
				<p class="muted">{m.stock_sold_auto_help()}</p>
				{#if visibleTransactions.length === 0}
					<p class="empty-state">{m.empty()}</p>
				{:else}
					<ul class="list">
						{#each visibleTransactions as transaction (transaction.id)}
							<li>
								<div class="list-main">
									<strong>{localize(transaction.name, '') || transaction.id}</strong>
									<span>
										{dateTime(transaction.time)} ·
										{transaction.records
											.map(
												(record) =>
													`${localize(record.product_name, '')} ${record.amount} (${record.kind})`
											)
											.join(', ')}
									</span>
								</div>
								<a
									class="button-link secondary"
									href={resolve('/stock/[groupId]/movements/[movementId]', {
										groupId,
										movementId: transaction.id
									})}>{m.edit()}</a>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
			<section class="card card-pad stack">
				<div>
					<h2 class="section-title">{m.stock_graph()}</h2>
					<p class="muted">{m.stock_graph_help()}</p>
				</div>
				{#if productOptions.length > 0}
					<SearchSelect
						label={m.stock_product()}
						value={graphProduct?.product_id ?? ''}
						options={productOptions}
						onchange={(productId) => (graphProductId = productId)} />
				{/if}
				{#if loadingGraph}
					<div class="center-stage"><div class="loader"></div></div>
				{:else if graphSeries.length === 0}
					<p class="empty-state">{m.stock_graph_empty()}</p>
				{:else}
					<LineChart
						points={graphSeries}
						label={m.stock_history()}
						unit={` ${graphProduct?.stock_unit ?? ''}`} />
				{/if}
			</section>
		{/if}
	</div>
{/if}

<style>
	.stock-summary {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 1rem;
	}
	.stock-summary .card {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.stock-summary strong {
		font-size: 1.6rem;
	}
	.data-table {
		width: 100%;
		border-collapse: collapse;
	}
	.data-table th,
	.data-table td {
		text-align: left;
		padding: 0.4rem 0.6rem;
		border-bottom: 1px solid var(--border, #ddd);
	}
	.movement-totals {
		display: block;
		color: #969d98;
		font-size: 0.75rem;
	}
</style>
