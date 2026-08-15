<script lang="ts">
	import { Users } from '@lucide/svelte';

	let { url = '', name, size = 28 }: { url?: string; name: string; size?: number } = $props();
</script>

<span class="group-icon" title={name} style={`--group-icon-size: ${size}px`}>
	{#if url}<img src={url} alt="" />{:else}<Users
			size={Math.max(14, size - 10)}
			aria-hidden="true" />{/if}
</span>
