<script lang="ts">
	import { page } from '$app/state';
	import AddonPage from '$lib/components/AddonPage.svelte';
	import * as m from '$lib/paraglide/messages';
	const activityId = $derived(page.url.searchParams.get('activity') ?? '');
</script>

<svelte:head><title>{m.create_new_addon()} · {m.app_name()}</title></svelte:head>
{#key activityId}<AddonPage id={null} {activityId} />{/key}
