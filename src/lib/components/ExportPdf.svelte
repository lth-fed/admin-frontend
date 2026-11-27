<script lang="ts">
	import { downloadGroupSales, downloadStock } from '$lib/api/admin';
	import { frontendError } from '$lib/api/client';
	import { saveBlob } from '$lib/download';
	import DateTimePicker from '$lib/components/DateTimePicker.svelte';
	import * as m from '$lib/paraglide/messages';
	import { toasts } from '$lib/toasts.svelte';

	/**
	 * One PDF export UI used everywhere: a date range plus the scope it applies to.
	 * - `sales`: sales of the group, optionally one activity and/or one product.
	 * - `stock`: stock movements of the group.
	 */
	let {
		kind,
		groupId,
		activityId = null,
		productId = null,
		/** A single stock movement; hides the period because the movement has its own time. */
		transactionId = null,
		fileName
	}: {
		kind: 'sales' | 'stock';
		groupId: string;
		activityId?: string | null;
		productId?: string | null;
		transactionId?: string | null;
		fileName: string;
	} = $props();

	let start = $state(new Date(Date.now() - 30 * 86_400_000).toISOString());
	let end = $state(new Date(Date.now() + 86_400_000).toISOString());
	let exporting = $state(false);
	let error = $state<string | null>(null);

	async function download(): Promise<void> {
		exporting = true;
		error = null;
		try {
			const blob =
				kind === 'stock'
					? await downloadStock(groupId, {
							start: transactionId ? undefined : start,
							end: transactionId ? undefined : end,
							transactionId: transactionId ?? undefined
						})
					: await downloadGroupSales(groupId, {
							start,
							end,
							activityId: activityId ?? undefined,
							productId: productId ?? undefined
						});
			saveBlob(blob, fileName);
			toasts.show('success', m.backend_success());
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			exporting = false;
		}
	}
</script>

<div class="stack">
	{#if error}<p class="error-banner" role="alert">{error}</p>{/if}
	{#if !transactionId}
		<div class="date-range">
			<DateTimePicker label={m.from()} value={start} onchange={(value) => (start = value)} />
			<DateTimePicker label={m.to()} value={end} onchange={(value) => (end = value)} />
		</div>
	{/if}
	<button
		class="button-link"
		type="button"
		disabled={exporting || (!transactionId && new Date(end) <= new Date(start))}
		onclick={() => void download()}>{exporting ? m.loading() : m.download_pdf()}</button>
</div>
