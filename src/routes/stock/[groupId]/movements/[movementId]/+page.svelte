<script lang="ts">
	import { page } from '$app/state';
	import StockMovementEditor from '$lib/components/StockMovementEditor.svelte';

	const groupId = $derived(page.params.groupId ?? '');
	const movementId = $derived(page.params.movementId ?? null);
</script>

{#key `${groupId}:${movementId}`}
	<StockMovementEditor {groupId} {movementId} />
{/key}
