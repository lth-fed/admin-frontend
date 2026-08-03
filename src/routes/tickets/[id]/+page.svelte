<script lang="ts">
	import { page } from '$app/state';
	import TicketEditor from '$lib/components/TicketEditor.svelte';
	import * as m from '$lib/paraglide/messages';
</script>

<svelte:head><title>{m.ticket_editor()} · {m.app_name()}</title></svelte:head>
<TicketEditor id={page.params.id ?? null} activityId="" />
