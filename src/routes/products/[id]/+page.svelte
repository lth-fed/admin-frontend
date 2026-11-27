<script lang="ts">
	import { page } from '$app/state';
	import ProductEditor from '$lib/components/ProductEditor.svelte';
	import * as m from '$lib/paraglide/messages';
	const activityId = $derived(page.url.searchParams.get('activity') ?? '');
	/** Opened from "add tickets": turn the activity's placeholder product into a real ticket. */
	const convertToTicket = $derived(page.url.searchParams.get('ticket') === '1');
</script>

<svelte:head><title>{m.product()} · {m.app_name()}</title></svelte:head>
{#key page.params.id}
	<ProductEditor id={page.params.id ?? null} {activityId} {convertToTicket} />
{/key}
