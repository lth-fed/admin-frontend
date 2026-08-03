<script lang="ts">
	import { page } from '$app/state';
	import TicketEditor from '$lib/components/TicketEditor.svelte';
	import * as m from '$lib/paraglide/messages';
	const activityId = $derived(page.url.searchParams.get('activity') ?? '');
</script>

<svelte:head><title>{m.new_ticket()} · {m.app_name()}</title></svelte:head>
<TicketEditor id={null} {activityId} />
