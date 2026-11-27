<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		downloadGroupSales,
		downloadPurchaseReceipt,
		emailPurchaseReceipt,
		getMe,
		listActivities,
		listGroupTree,
		listPurchaseHistory,
		listPurchases,
		listSoldProducts
	} from '$lib/api/admin';
	import { frontendError } from '$lib/api/client';
	import type {
		AdminPurchaseHistoryStep,
		AdminPurchaseRow,
		BriefActivity,
		Group,
		SoldProduct
	} from '$lib/api/types';
	import { rememberActiveGroup, resolveActiveGroup } from '$lib/active-group';
	import ActiveGroupPicker from '$lib/components/ActiveGroupPicker.svelte';
	import DateTimePicker from '$lib/components/DateTimePicker.svelte';
	import { saveBlob } from '$lib/download';
	import { dateTime, kronor, localize, sortByLocalizedName } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { toasts } from '$lib/toasts.svelte';
	import { onMount } from 'svelte';

	let groups = $state<Group[]>([]);
	let adminGroupIds = $state<string[]>([]);
	let groupId = $state('');
	// Empty means the whole group; otherwise only that activity's sales.
	let activityId = $state('');
	let start = $state(new Date(Date.now() - 30 * 86_400_000).toISOString());
	let end = $state(new Date(Date.now() + 86_400_000).toISOString());
	let sold = $state<SoldProduct[]>([]);
	let purchases = $state<AdminPurchaseRow[]>([]);
	let activities = $state<BriefActivity[]>([]);
	let loading = $state(true);
	let loadingRows = $state(false);
	let error = $state<string | null>(null);
	let exporting = $state(false);
	let receiptPurchaseId = $state('');
	let emailPurchaseId = $state('');
	let emailAddress = $state('');
	let sending = $state(false);
	/** The purchase whose ownership history is expanded, and the loaded chain. */
	let historyPurchaseId = $state('');
	let historySteps = $state<AdminPurchaseHistoryStep[]>([]);
	let loadingHistory = $state(false);
	let requestToken = 0;

	const administrableActivities = $derived(
		sortByLocalizedName(
			activities.filter((activity) =>
				activity.host_ids.some((host) => adminGroupIds.includes(host))
			),
			(activity) => activity.title
		)
	);
	const sortedSold = $derived(
		sortByLocalizedName(sold, (product) => product.name).filter(
			(product) => product.sold > 0 || product.refunded > 0
		)
	);

	onMount(() => {
		void load();
	});

	async function load(): Promise<void> {
		try {
			const [me, tree] = await Promise.all([getMe(), listGroupTree()]);
			adminGroupIds = me.admin_group_ids;
			groups = tree;
			groupId = resolveActiveGroup('purchases', tree, me.admin_group_ids);
			rememberActiveGroup('purchases', groupId);
			activities = await listActivities();
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		const selectedGroup = groupId;
		const selectedActivity = activityId;
		const from = start;
		const to = end;
		void loadRows({ selectedGroup, selectedActivity, from, to });
	});

	async function loadRows(scope: {
		selectedGroup: string;
		selectedActivity: string;
		from: string;
		to: string;
	}): Promise<void> {
		const token = ++requestToken;
		if (!scope.selectedGroup) {
			sold = [];
			purchases = [];
			loadingRows = false;
			return;
		}
		loadingRows = true;
		error = null;
		historyPurchaseId = '';
		const query = {
			groupId: scope.selectedActivity ? undefined : scope.selectedGroup,
			activityId: scope.selectedActivity || undefined,
			start: scope.from,
			end: scope.to
		};
		try {
			const [summary, rows] = await Promise.all([listSoldProducts(query), listPurchases(query)]);
			if (token !== requestToken) return;
			sold = summary;
			purchases = rows;
		} catch (cause) {
			if (token === requestToken) error = frontendError(cause);
		} finally {
			if (token === requestToken) loadingRows = false;
		}
	}

	function selectGroup(id: string): void {
		groupId = id;
		activityId = '';
		rememberActiveGroup('purchases', id);
	}

	async function downloadReport(): Promise<void> {
		exporting = true;
		error = null;
		try {
			const blob = await downloadGroupSales(groupId, {
				start,
				end,
				activityId: activityId || undefined
			});
			saveBlob(blob, activityId ? `sales-activity-${activityId}.pdf` : `sales-${groupId}.pdf`);
			toasts.show('success', m.backend_success());
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			exporting = false;
		}
	}

	async function downloadReceipt(purchase: AdminPurchaseRow): Promise<void> {
		receiptPurchaseId = purchase.id;
		error = null;
		try {
			const blob = await downloadPurchaseReceipt(purchase.id);
			saveBlob(blob, `kvitto-${purchase.id}.pdf`);
			toasts.show('success', m.backend_success());
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			receiptPurchaseId = '';
		}
	}

	function openEmail(purchase: AdminPurchaseRow): void {
		emailPurchaseId = purchase.id;
		emailAddress = '';
	}

	/** Expands the ownership chain of one purchase, fetching it the first time it is opened. */
	async function toggleHistory(purchase: AdminPurchaseRow): Promise<void> {
		if (historyPurchaseId === purchase.id) {
			historyPurchaseId = '';
			return;
		}
		historyPurchaseId = purchase.id;
		historySteps = [];
		loadingHistory = true;
		error = null;
		try {
			const steps = await listPurchaseHistory(purchase.id);
			// The admin may have opened another purchase while this one was loading.
			if (historyPurchaseId === purchase.id) historySteps = steps;
		} catch (cause) {
			if (historyPurchaseId === purchase.id) error = frontendError(cause);
		} finally {
			if (historyPurchaseId === purchase.id) loadingHistory = false;
		}
	}

	async function sendReceipt(): Promise<void> {
		sending = true;
		error = null;
		try {
			await emailPurchaseReceipt(emailPurchaseId, emailAddress.trim());
			toasts.show('success', m.purchases_receipt_sent());
			emailPurchaseId = '';
			emailAddress = '';
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			sending = false;
		}
	}

	/** Items are exhausted once every use is spent; tickets are single-use and never grey out. */
	function isExhausted(purchase: AdminPurchaseRow): boolean {
		return purchase.kind !== 'ticket' && purchase.uses >= purchase.max_uses;
	}
</script>

<svelte:head><title>{m.purchases()} · {m.app_name()}</title></svelte:head>

<header class="page-header">
	<div>
		<p class="eyebrow">{m.nav_purchases()}</p>
		<h1>{m.purchases()}</h1>
		<p class="muted">{m.purchases_help()}</p>
	</div>
</header>

{#if error}<p class="error-banner" role="alert">{error}</p>{/if}

{#if loading}
	<div class="center-stage"><div class="loader"></div></div>
{:else}
	<section class="card card-pad stack">
		<div class="toolbar purchase-filters">
			<ActiveGroupPicker
				pageKey="purchases"
				{groups}
				{adminGroupIds}
				value={groupId}
				onchange={selectGroup} />
			<label class="field">
				<span>{m.purchases_activity()}</span>
				<select bind:value={activityId} disabled={administrableActivities.length === 0}>
					<option value="">{m.purchases_all_activities()}</option>
					{#each administrableActivities as activity (activity.id)}
						<option value={activity.id}>{localize(activity.title, '')}</option>
					{/each}
				</select>
			</label>
			<DateTimePicker label={m.from()} value={start} onchange={(value) => (start = value)} />
			<DateTimePicker label={m.to()} value={end} onchange={(value) => (end = value)} />
		</div>
		<div class="toolbar">
			<button
				class="button-link"
				type="button"
				disabled={exporting || !groupId || new Date(end) <= new Date(start)}
				onclick={() => void downloadReport()}>
				{exporting ? m.loading() : m.purchases_download_report()}
			</button>
		</div>
	</section>

	{#if !groupId}
		<p class="empty-state">{m.active_group_none()}</p>
	{:else if loadingRows}
		<div class="center-stage"><div class="loader"></div></div>
	{:else}
		<section class="card card-pad stack">
			<h2 class="section-title">{m.purchases_sold()}</h2>
			{#if sortedSold.length === 0}
				<p class="empty-state">{m.purchases_none()}</p>
			{:else}
				<table class="data-table">
					<thead>
						<tr>
							<th>{m.product()}</th>
							<th>{m.purchases_sold_count()}</th>
							<th>{m.purchases_refunded()}</th>
							<th>{m.purchases_revenue()}</th>
							<th>{m.purchases_uses()}</th>
						</tr>
					</thead>
					<tbody>
						{#each sortedSold as product (product.product_id)}
							<tr
								class:worn-out={product.uses_possible > 0 && product.uses >= product.uses_possible}>
								<td>
									<a href={resolve('/products/[id]', { id: product.product_id })}
										>{localize(product.name, '')}</a>
								</td>
								<td>{product.sold}</td>
								<td>{product.refunded}</td>
								<td>{kronor(product.revenue)}</td>
								<td>
									{product.uses} / {product.uses_possible}
									{#if product.uses_possible > 0 && product.uses >= product.uses_possible}
										<span class="pill">{m.purchases_used_up()}</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>

		<section class="card card-pad stack">
			<h2 class="section-title">{m.purchases_list()}</h2>
			{#if emailPurchaseId}
				<form
					class="toolbar receipt-email"
					onsubmit={(event) => {
						event.preventDefault();
						void sendReceipt();
					}}>
					<label class="field">
						<span>{m.purchases_receipt_email()}</span>
						<input type="email" required bind:value={emailAddress} />
					</label>
					<button
						class="button-link"
						type="submit"
						disabled={sending || emailAddress.trim() === ''}>
						{sending ? m.loading() : m.purchases_send_receipt()}
					</button>
					<button class="button-link" type="button" onclick={() => (emailPurchaseId = '')}>
						{m.cancel()}
					</button>
				</form>
			{/if}
			{#if purchases.length === 0}
				<p class="empty-state">{m.purchases_none()}</p>
			{:else}
				<table class="data-table">
					<thead>
						<tr>
							<th>{m.product()}</th>
							<th>{m.purchases_buyer()}</th>
							<th>{m.purchases_owner()}</th>
							<th>{m.purchases_purchased_at()}</th>
							<th>{m.purchases_paid()}</th>
							<th>{m.purchases_uses()}</th>
							<th>{m.purchases_receipt()}</th>
						</tr>
					</thead>
					<tbody>
						{#each purchases as purchase (purchase.id)}
							<tr class:worn-out={isExhausted(purchase)}>
								<td>
									<a href={resolve('/products/[id]', { id: purchase.product_id })}
										>{localize(purchase.product_name, '')}</a>
									{#if purchase.refunded}
										<span class="pill">{m.purchases_refunded()}</span>
									{/if}
									<button
										class="button-link secondary compact"
										type="button"
										aria-expanded={historyPurchaseId === purchase.id}
										onclick={() => void toggleHistory(purchase)}>
										{historyPurchaseId === purchase.id
											? m.purchases_history_hide()
											: m.purchases_history()}
									</button>
								</td>
								<td>{purchase.purchaser_name || purchase.purchaser_id}</td>
								<td>{purchase.owner_name || purchase.owner_id}</td>
								<td>{dateTime(purchase.purchased_at)}</td>
								<td>{kronor(purchase.paid_price)}</td>
								<td class:used-up={isExhausted(purchase)}>
									{purchase.uses} / {purchase.max_uses}
									{#if isExhausted(purchase)}
										<span class="pill">{m.purchases_used_up()}</span>
									{/if}
								</td>
								<td>
									{#if purchase.has_receipt}
										<div class="toolbar receipt-actions">
											<button
												class="button-link"
												type="button"
												disabled={receiptPurchaseId === purchase.id}
												onclick={() => void downloadReceipt(purchase)}>
												{m.purchases_get_receipt()}
											</button>
											<button class="button-link" type="button" onclick={() => openEmail(purchase)}>
												{m.purchases_send_receipt()}
											</button>
										</div>
									{:else}
										<span class="muted">{m.purchases_no_receipt()}</span>
									{/if}
								</td>
							</tr>
							{#if historyPurchaseId === purchase.id}
								<tr>
									<td colspan="7">
										{#if loadingHistory}
											<div class="center-stage"><div class="loader"></div></div>
										{:else if historySteps.length === 0}
											<p class="muted">{m.purchases_history_empty()}</p>
										{:else}
											<table class="data-table history-table">
												<thead>
													<tr>
														<th>{m.purchases_owner()}</th>
														<th>{m.from()}</th>
														<th>{m.purchases_purchased_at()}</th>
														<th>{m.purchases_paid()}</th>
														<th>{m.purchases_refunded()}</th>
													</tr>
												</thead>
												<tbody>
													{#each historySteps as step, index (`${step.buyer_id}:${index}`)}
														<tr>
															<td>{step.buyer_name || step.buyer_id}</td>
															<td>
																{#if step.transaction_id}
																	{step.seller_name || step.seller_id || '—'}
																{:else}
																	<span class="pill">{m.purchases_history_transfer()}</span>
																{/if}
															</td>
															<td>{dateTime(step.completed_at)}</td>
															<td>{step.paid === undefined ? '—' : kronor(step.paid)}</td>
															<td>
																{#if step.refunded === undefined}
																	<span class="muted">—</span>
																{:else}
																	<span class="pill">{kronor(step.refunded)}</span>
																{/if}
															</td>
														</tr>
													{/each}
												</tbody>
											</table>
										{/if}
									</td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			{/if}
		</section>
	{/if}
{/if}

<style>
	.purchase-filters {
		align-items: flex-end;
		flex-wrap: wrap;
	}
	.receipt-email {
		align-items: flex-end;
		flex-wrap: wrap;
	}
	.receipt-actions {
		gap: 6px;
	}
	.worn-out,
	.used-up {
		opacity: 0.5;
	}
</style>
