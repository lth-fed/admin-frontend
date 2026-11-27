<script lang="ts">
	import { page } from '$app/state';
	import ProductEditor from '$lib/components/ProductEditor.svelte';
	import * as m from '$lib/paraglide/messages';
	const activityId = $derived(page.url.searchParams.get('activity') ?? '');
	/** Product to start from, for "duplicate". */
	const copyId = $derived(page.url.searchParams.get('copy'));
</script>

<svelte:head><title>{m.product()} · {m.app_name()}</title></svelte:head>
<ProductEditor id={null} {activityId} {copyId} />
