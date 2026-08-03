<script lang="ts">
	import { toasts } from '$lib/toasts.svelte';
	import { CircleCheck, CircleX, X } from '@lucide/svelte';
</script>

<div class="toast-stack" aria-live="polite" aria-relevant="additions">
	{#each toasts.items as toast (toast.id)}
		<div
			class:error={toast.kind === 'error'}
			class="toast"
			role={toast.kind === 'error' ? 'alert' : 'status'}>
			{#if toast.kind === 'success'}<CircleCheck size={20} />{:else}<CircleX size={20} />{/if}
			<span>{toast.message}</span>
			<button type="button" aria-label="Close" onclick={() => toasts.dismiss(toast.id)}
				><X size={17} /></button>
		</div>
	{/each}
</div>
