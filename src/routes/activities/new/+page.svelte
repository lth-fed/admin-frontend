<script lang="ts">
	import ActivityEditor from '$lib/components/ActivityEditor.svelte';
	import * as m from '$lib/paraglide/messages';
</script>

<svelte:head><title>{m.new_activity()} · {m.app_name()}</title></svelte:head>
<ActivityEditor id={null} />
