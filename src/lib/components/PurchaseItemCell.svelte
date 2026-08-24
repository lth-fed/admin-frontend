<script lang="ts">
	import { Download } from '@lucide/svelte';
	import type { ICellProps, IRow } from '@svar-ui/svelte-grid';

	type PurchaseRow = IRow & {
		item?: unknown;
		addonExport?: {
			label: string;
			run: () => void;
		};
	};

	let { row }: ICellProps = $props();
	const purchaseRow = $derived(row as PurchaseRow);

	function exportAddon(event: MouseEvent): void {
		event.stopPropagation();
		purchaseRow.addonExport?.run();
	}
</script>

<div class="purchase-cell">
	<span class="purchase-label">{String(purchaseRow.item ?? '')}</span>
	{#if purchaseRow.addonExport}
		<button
			class="button-link secondary compact addon-export-button"
			type="button"
			aria-label={purchaseRow.addonExport.label}
			title={purchaseRow.addonExport.label}
			onclick={exportAddon}>
			<Download size={16} />
		</button>
	{/if}
</div>

<style>
	.purchase-cell {
		display: flex;
		flex: 1 1 auto;
		align-items: center;
		min-width: 0;
		gap: 8px;
	}

	.purchase-label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.addon-export-button {
		flex: 0 0 auto;
		margin-left: auto;
		padding: 0px;
	}
</style>
