<script lang="ts">
	import { page } from '$app/state';
	import ActivityEditor from '$lib/components/ActivityEditor.svelte';
	import * as m from '$lib/paraglide/messages';
</script>

<svelte:head><title>{m.edit_activity()} · {m.app_name()}</title></svelte:head>
{#key page.params.id}
	<ActivityEditor id={page.params.id ?? null} />
{/key}
