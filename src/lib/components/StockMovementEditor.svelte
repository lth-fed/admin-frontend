<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		createStockTransaction,
		listActivities,
		listGroupTree,
		listStock,
		listStockTransactions,
		replenishStockSalesStock,
		updateStockTransaction
	} from '$lib/api/admin';
	import { frontendError } from '$lib/api/client';
	import type {
		BriefActivity,
		Group,
		PutStockTransaction,
		StockLine,
		StockRecordKind
	} from '$lib/api/types';
	import ExportPdf from '$lib/components/ExportPdf.svelte';
	import LocalizedField from '$lib/components/LocalizedField.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import { localize, sortByLocalizedName } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { toasts } from '$lib/toasts.svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { onMount } from 'svelte';

	let {
		groupId,
		movementId = null,
		/** Activity a new movement is opened from; preselected and linked on save. */
		presetActivityId = null,
		/**
		 * A movement either handles the store/activities, buys from suppliers, or is a stocktake
		 * (counted levels as signed `inventory` adjustments).
		 */
		mode = 'store'
	}: {
		groupId: string;
		movementId?: string | null;
		presetActivityId?: string | null;
		mode?: MovementMode;
	} = $props();

	type MovementMode = 'store' | 'procurement' | 'stocktake';

	const KIND_LABELS: Record<StockRecordKind, () => string> = {
		purchase: m.stock_purchase,
		refund: m.stock_refund,
		'take-out': m.stock_take_out,
		'put-back': m.stock_put_back,
		sales: m.stock_sales,
		'sales-refund': m.stock_sales_refund,
		balance: m.stock_balance,
		inventory: m.stock_inventory
	};
	const STORE_KINDS: StockRecordKind[] = [
		'take-out',
		'put-back',
		'sales',
		'sales-refund',
		'balance'
	];
	const PROCUREMENT_KINDS: StockRecordKind[] = ['purchase', 'refund'];
	/** A stocktake only records counted levels; the reset movement already zeroed the books. */
	const STOCKTAKE_KINDS: StockRecordKind[] = ['inventory'];
	// Only the initial mode matters; a stored movement decides for itself once loaded.
	// svelte-ignore state_referenced_locally
	let effectiveMode = $state<MovementMode>(mode);
	const procurement = $derived(effectiveMode === 'procurement');
	const stocktake = $derived(effectiveMode === 'stocktake');
	const modeKinds = $derived(
		procurement ? PROCUREMENT_KINDS : stocktake ? STOCKTAKE_KINDS : STORE_KINDS
	);
	/** One entry point per kind: the button decides the kind, so every row has a single kind. */
	const addActions = $derived(
		modeKinds.map((kind) => ({
			kind,
			// In a stocktake the row *is* the counted product, so "add row" reads better.
			label: stocktake ? m.add_record : KIND_LABELS[kind]
		}))
	);

	let group = $state<Group | null>(null);
	let lines = $state<StockLine[]>([]);
	let name = $state<Record<string, string>>({ sv: '', en: '' });
	let existingId = $state<string | null>(null);
	// Only the first value matters: the movement is opened from one activity and then edited.
	// svelte-ignore state_referenced_locally
	let activityId = $state(presetActivityId ?? '');
	let activities = $state<BriefActivity[]>([]);
	type MovementRecord = { product_id: string; amount: number; kind: StockRecordKind };
	let records = $state<MovementRecord[]>([]);
	let loading = $state(true);
	let saving = $state(false);
	let error = $state<string | null>(null);

	const sortedLines = $derived(sortByLocalizedName(lines, (line) => line.name));
	const productOptions = $derived(
		sortedLines.map((line) => ({ id: line.product_id, label: localize(line.name, '') }))
	);

	type Balance = {
		takeOut: number;
		sold: number;
		putBack: number;
		balance: number;
		salesRefund: number;
		supplierReturn: number;
		purchased: number;
	};
	const emptyBalance = (): Balance => ({
		takeOut: 0,
		sold: 0,
		putBack: 0,
		balance: 0,
		salesRefund: 0,
		supplierReturn: 0,
		purchased: 0
	});

	/**
	 * Per product, in the bookkeeping identity:
	 * take-out − sold − put-back − balance + sale refunds + supplier returns − purchased.
	 * Zero means every unit is accounted for.
	 */
	const reconciliation = $derived.by(() => {
		const byProduct = new SvelteMap<string, Balance>();
		for (const record of records) {
			const entry = byProduct.get(record.product_id) ?? emptyBalance();
			if (record.kind === 'take-out') entry.takeOut += record.amount;
			if (record.kind === 'sales') entry.sold += record.amount;
			if (record.kind === 'put-back') entry.putBack += record.amount;
			if (record.kind === 'balance') entry.balance += record.amount;
			if (record.kind === 'sales-refund') entry.salesRefund += record.amount;
			if (record.kind === 'refund') entry.supplierReturn += record.amount;
			if (record.kind === 'purchase') entry.purchased += record.amount;
			byProduct.set(record.product_id, entry);
		}
		return [...byProduct.entries()].map(([productId, entry]) => ({
			productId,
			name: productOptions.find((option) => option.id === productId)?.label || productId,
			...entry,
			total:
				entry.takeOut -
				entry.sold -
				entry.putBack -
				entry.balance +
				entry.salesRefund +
				entry.supplierReturn -
				entry.purchased
		}));
	});

	onMount(async () => {
		try {
			const [tree, stock, activityList] = await Promise.all([
				listGroupTree(),
				listStock(groupId),
				listActivities()
			]);
			group = tree.find((entry) => entry.id === groupId) ?? null;
			lines = stock;
			activities = sortByLocalizedName(activityList, (activity) => activity.title);
			if (movementId) {
				const transactions = await listStockTransactions(groupId);
				const transaction = transactions.find((entry) => entry.id === movementId);
				if (!transaction) throw new Error(m.not_found());
				existingId = transaction.id;
				name = transaction.name;
				activityId = transaction.activity_id ?? '';
				records = transaction.records.map((record) => ({
					product_id: record.product_id,
					amount: record.amount,
					kind: record.kind
				}));
				// A stored movement tells us which kind it is, so opening it always edits it as such.
				if (records.some((record) => PROCUREMENT_KINDS.includes(record.kind))) {
					effectiveMode = 'procurement';
				} else if (records.some((record) => STOCKTAKE_KINDS.includes(record.kind))) {
					effectiveMode = 'stocktake';
				}
			} else if (stocktake) {
				// Counted rows are added one by one as the products are found on the shelves.
				name = { [getLocale()]: m.stock_inventory_movement() };
			} else if (sortedLines[0]) {
				records = [
					{
						product_id: sortedLines[0].product_id,
						amount: 1,
						kind: procurement ? 'purchase' : 'take-out'
					}
				];
			}
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			loading = false;
		}
	});

	function addRecord(kind: StockRecordKind): void {
		records = [
			...records,
			{
				product_id: records.at(-1)?.product_id ?? sortedLines[0]?.product_id ?? '',
				amount: 1,
				kind
			}
		];
	}

	function removeRecord(index: number): void {
		records = records.filter((_, current) => current !== index);
	}

	function kindLabel(kind: StockRecordKind): string {
		return KIND_LABELS[kind]();
	}

	const salesStockByProduct = $derived(
		new SvelteMap(lines.map((line) => [line.product_id, line.sales_stock]))
	);

	/** Every unit is accounted for in store movements; purchases are recorded, so their sum is not 0. */
	function balanced(total: number): boolean {
		return procurement ? total !== 0 : total === 0;
	}

	const nothingToRecord = $derived(procurement && reconciliation.every((row) => row.total === 0));

	async function replenishSalesStock(): Promise<void> {
		if (!existingId || !confirm(m.stock_replenish_confirm())) return;
		saving = true;
		error = null;
		try {
			const updated = await replenishStockSalesStock(existingId);
			toasts.show('success', m.stock_replenish_done({ count: updated }));
			lines = await listStock(groupId);
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			saving = false;
		}
	}

	const takesOutWithoutActivity = $derived(
		!activityId && records.some((record) => record.kind === 'take-out')
	);

	async function save(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (records.length === 0) return;
		if (takesOutWithoutActivity && !confirm(m.stock_take_out_no_activity_confirm())) return;
		saving = true;
		error = null;
		const body: PutStockTransaction = {
			id: existingId ?? crypto.randomUUID(),
			name,
			activity_id: activityId || undefined,
			records
		};
		try {
			if (existingId) await updateStockTransaction(existingId, body);
			else await createStockTransaction(groupId, body);
			toasts.show('success', m.backend_success());
			await goto(resolve('/stock/[groupId]', { groupId }));
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			saving = false;
		}
	}
</script>

<header class="page-header">
	<div>
		<p class="eyebrow">{m.nav_stock()} · {group ? localize(group.name, group.path) : ''}</p>
		<h1>
			{existingId
				? m.edit_stock_transaction()
				: stocktake
					? m.stock_inventory()
					: m.new_stock_transaction()}
		</h1>
	</div>
	<div class="toolbar">
		<a class="button-link secondary" href={resolve('/stock/[groupId]', { groupId })}>{m.back()}</a>
	</div>
</header>

{#if loading}
	<div class="center-stage">
		<div class="loader"></div>
		<p>{m.loading()}</p>
	</div>
{:else}
	<form class="stack" novalidate onsubmit={save}>
		{#if error}<p class="error-banner" role="alert">{error}</p>{/if}
		{#if existingId}<p class="info-banner">{m.edit_stock_transaction_help()}</p>{/if}
		{#if takesOutWithoutActivity}<p class="info-banner" role="status">
				{m.stock_take_out_no_activity_warning()}
			</p>{/if}

		<section class="card card-pad stack">
			<h2 class="section-title">{m.details()}</h2>
			<LocalizedField
				value={name}
				labelSv={m.name_sv()}
				labelEn={m.name_en()}
				required
				onchange={(value) => (name = value)} />
			{#if !stocktake}
				<label class="field"
					><span>{m.stock_moved_to_activity()}</span>
					<select bind:value={activityId}>
						<option value="">{m.stock_no_activity()}</option>
						{#if activityId && !activities.some((activity) => activity.id === activityId)}
							<option value={activityId}>{activityId}</option>
						{/if}
						{#each activities as activity (activity.id)}
							<option value={activity.id}>{localize(activity.title, '')}</option>
						{/each}
					</select></label>
			{/if}
		</section>

		<section class="card card-pad stack">
			<div>
				<h2 class="section-title">{m.stock_records()}</h2>
				<p class="muted">
					{procurement
						? m.stock_add_purchase_help()
						: stocktake
							? m.stock_add_stocktake_help()
							: m.stock_add_record_help()}
				</p>
			</div>
			<div class="toolbar wrap">
				{#each addActions as action (action.kind)}
					<button class="button-link secondary" type="button" onclick={() => addRecord(action.kind)}
						>+ {action.label()}</button>
				{/each}
			</div>
			{#if records.length === 0}
				<p class="empty-state">{m.empty()}</p>
			{/if}
			{#each records as record, index (index)}
				<div class="stock-record">
					<SearchSelect
						label={m.product()}
						value={record.product_id}
						options={productOptions}
						onchange={(product_id) => (record.product_id = product_id)} />
					<div class="field">
						<span>{m.kind()}</span>
						<span class="pill">{kindLabel(record.kind)}</span>
					</div>
					<label class="field"
						><span>{stocktake ? m.stock_counted_amount() : m.amount()}</span>
						<input type="number" step="0.000001" bind:value={record.amount} /></label>
					<button
						class="button-link secondary danger-button"
						type="button"
						onclick={() => removeRecord(index)}>{m.remove()}</button>
				</div>
			{/each}
		</section>

		{#if reconciliation.length > 0 && !stocktake}
			<section class="card card-pad stack">
				<div>
					<h2 class="section-title">{m.stock_reconciliation()}</h2>
					<p class="muted">
						{procurement ? m.stock_reconciliation_purchase_help() : m.stock_reconciliation_help()}
					</p>
				</div>
				{#if nothingToRecord}
					<p class="info-banner" role="status">{m.stock_reconciliation_purchase_empty()}</p>
				{/if}
				<div class="table-scroll">
					<table class="data-table">
						<thead>
							<tr>
								<th>{m.product()}</th>
								{#if procurement}
									<th class="numeric">{m.stock_refund()}</th>
									<th class="numeric">{m.stock_purchase()}</th>
								{:else}
									<th class="numeric">{m.stock_take_out()}</th>
									<th class="numeric">{m.stock_sales()}</th>
									<th class="numeric">{m.stock_put_back()}</th>
									<th class="numeric">{m.stock_balance()}</th>
									<th class="numeric">{m.stock_sales_refund()}</th>
								{/if}
								<th class="numeric">{m.stock_available()}</th>
								<th class="numeric">{m.stock_reconciliation_total()}</th>
							</tr>
						</thead>
						<tbody>
							{#each reconciliation as row (row.productId)}
								<tr>
									<td>{row.name}</td>
									{#if procurement}
										<td class="numeric">{row.supplierReturn}</td>
										<td class="numeric">{row.purchased}</td>
									{:else}
										<td class="numeric">{row.takeOut}</td>
										<td class="numeric">{row.sold}</td>
										<td class="numeric">{row.putBack}</td>
										<td class="numeric">{row.balance}</td>
										<td class="numeric">{row.salesRefund}</td>
									{/if}
									<td class="numeric">{salesStockByProduct.get(row.productId) ?? '∞'}</td>
									<td class="numeric" class:stock-matches={balanced(row.total)}>
										{row.total}
										{#if balanced(row.total)}<span aria-hidden="true"> ✓</span>{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if procurement && existingId}
					<div class="toolbar">
						<button
							class="button-link secondary"
							type="button"
							disabled={saving}
							title={m.stock_replenish_help()}
							onclick={() => void replenishSalesStock()}>{m.stock_replenish()}</button>
					</div>
					<p class="muted">{m.stock_replenish_help()}</p>
				{/if}
			</section>
		{/if}

		{#if existingId}
			<section class="card card-pad stack">
				<h2 class="section-title">{m.stock_export()}</h2>
				<p class="muted">{m.stock_export_help()}</p>
				<ExportPdf
					kind="stock"
					{groupId}
					transactionId={existingId}
					fileName={`stock-{existingId}.pdf`} />
			</section>
		{/if}

		<div class="editor-action-dock">
			<button class="button-link" type="submit" disabled={saving || records.length === 0}
				>{saving ? m.saving() : m.save()}</button>
		</div>
	</form>
{/if}

<style>
	.stock-record {
		display: grid;
		grid-template-columns: 2fr 1fr 1fr auto;
		gap: 1rem;
		align-items: end;
	}
	.table-scroll {
		overflow-x: auto;
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
	.numeric {
		text-align: right;
	}
	.stock-matches {
		color: #7fb98a;
		font-weight: 650;
	}
	@media (max-width: 800px) {
		.stock-record {
			grid-template-columns: 1fr;
		}
	}
</style>
