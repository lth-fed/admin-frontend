<script lang="ts">
	import { page } from '$app/state';
	import StockMovementEditor from '$lib/components/StockMovementEditor.svelte';

	const groupId = $derived(page.params.groupId ?? '');
	const activityId = $derived(page.url.searchParams.get('activity'));
	/** Each kind of movement has its own entry point; the modes do not mix. */
	const mode = $derived(
		page.url.searchParams.get('mode') === 'procurement'
			? 'procurement'
			: page.url.searchParams.get('mode') === 'stocktake'
				? 'stocktake'
				: 'store'
	);
</script>

{#key groupId}
	<StockMovementEditor {groupId} presetActivityId={activityId} {mode} />
{/key}
