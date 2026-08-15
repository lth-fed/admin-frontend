<script lang="ts">
	import NewActivityWizard from '$lib/components/NewActivityWizard.svelte';
	import * as m from '$lib/paraglide/messages';
</script>

<svelte:head><title>{m.new_activity()} · {m.app_name()}</title></svelte:head>
<NewActivityWizard />
