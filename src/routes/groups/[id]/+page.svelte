<script lang="ts">
	import { page } from '$app/state';
	import GroupEditor from '$lib/components/GroupEditor.svelte';
	import * as m from '$lib/paraglide/messages';
</script>

<svelte:head><title>{m.group_details()} · {m.app_name()}</title></svelte:head><GroupEditor
	id={page.params.id ?? null} />
