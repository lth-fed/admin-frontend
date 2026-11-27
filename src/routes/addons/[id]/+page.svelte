<script lang="ts">
	import { page } from '$app/state';
	import AddonPage from '$lib/components/AddonPage.svelte';
	import * as m from '$lib/paraglide/messages';
	const activityId = $derived(page.url.searchParams.get('activity') ?? '');
	const productId = $derived(page.url.searchParams.get('product') ?? '');
</script>

<svelte:head><title>{m.edit_addon()} · {m.app_name()}</title></svelte:head>
{#key `${page.params.id}:${activityId}:${productId}`}<AddonPage
		id={page.params.id ?? null}
		{activityId}
		{productId} />{/key}
