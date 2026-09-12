<script lang="ts">
	import { FileChartColumn, FileUser } from '@lucide/svelte';
	import type { ICellProps, IRow } from '@svar-ui/svelte-grid';

	type CsvExport = {
		kind: 'totals' | 'users';
		label: string;
		run: () => void;
	};

	type PurchaseRow = IRow & {
		item?: unknown;
		csvExports?: CsvExport[];
	};

	let { row }: ICellProps = $props();
	const purchaseRow = $derived(row as PurchaseRow);

	function exportCsv(event: MouseEvent, csvExport: CsvExport): void {
		event.stopPropagation();
		csvExport.run();
	}
</script>

<div class="purchase-cell">
	<span class="purchase-label">{String(purchaseRow.item ?? '')}</span>
	{#if purchaseRow.csvExports}
		<div class="csv-export-buttons">
			{#each purchaseRow.csvExports as csvExport (csvExport.kind)}
				<button
					class="button-link secondary compact csv-export-button"
					type="button"
					aria-label={csvExport.label}
					title={csvExport.label}
					onclick={(event) => exportCsv(event, csvExport)}>
					{#if csvExport.kind === 'users'}
						<FileUser size={16} />
					{:else}
						<FileChartColumn size={16} />
					{/if}
				</button>
			{/each}
		</div>
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

	.csv-export-buttons {
		display: flex;
		flex: 0 0 auto;
		margin-left: auto;
		gap: 4px;
	}

	.csv-export-button {
		padding: 0px;
	}
</style>
