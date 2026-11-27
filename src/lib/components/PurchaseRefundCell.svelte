<script lang="ts">
	import type { ICellProps, IRow } from '@svar-ui/svelte-grid';
	import * as m from '$lib/paraglide/messages';

	type RefundRow = IRow & {
		purchaseId?: string;
		refunded?: boolean;
		refund?: (purchaseId: string, message?: string) => Promise<void>;
	};

	let { row }: ICellProps = $props();
	const refundRow = $derived(row as RefundRow);
	let busy = $state(false);

	async function refund(event: MouseEvent): Promise<void> {
		event.stopPropagation();
		if (!refundRow.purchaseId || !refundRow.refund) return;
		if (!confirm(m.refund_purchase_confirm())) return;
		// The owner sees this in the refund push notification.
		const message = prompt(m.refund_message_prompt(), '');
		if (message === null) return;
		busy = true;
		try {
			await refundRow.refund(refundRow.purchaseId, message.trim() || undefined);
		} finally {
			busy = false;
		}
	}
</script>

{#if refundRow.purchaseId}
	{#if refundRow.refunded}
		<span class="muted">{m.refunded()}</span>
	{:else}
		<button
			class="button-link secondary compact"
			type="button"
			disabled={busy}
			onclick={(event) => void refund(event)}>{busy ? m.loading() : m.refund()}</button>
	{/if}
{/if}
