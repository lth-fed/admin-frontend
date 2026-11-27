<script lang="ts">
	import { page } from '$app/state';
	import AddonPage from '$lib/components/AddonPage.svelte';
	import * as m from '$lib/paraglide/messages';
	const activityId = $derived(page.url.searchParams.get('activity') ?? '');
	const productId = $derived(page.url.searchParams.get('product') ?? '');
</script>

<svelte:head><title>{m.new_addon()} · {m.app_name()}</title></svelte:head>
{#key `${activityId}:${productId}`}<AddonPage id={null} {activityId} {productId} />{/key}
