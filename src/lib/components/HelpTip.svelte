<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { CircleHelp } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	let { text, children }: { text: string; children: Snippet } = $props();
	let open = $state(false);
</script>

<div class="help-tip-container">
	{@render children()}
	<button
		class="help-tip-button"
		type="button"
		aria-label={m.show_explanation()}
		aria-expanded={open}
		onclick={() => (open = !open)}
		onblur={() => (open = false)}>
		<CircleHelp size={16} />
	</button>
	{#if open}<div class="help-tip" role="tooltip">{text}</div>{/if}
</div>

<style>
	.help-tip-container {
		position: relative;
		min-width: 0;
	}
	.help-tip-container :global(input),
	.help-tip-container :global(textarea),
	.help-tip-container :global(select) {
		padding-right: 2.35rem;
	}
	.help-tip-button {
		position: absolute;
		right: 0.55rem;
		bottom: 0.55rem;
		display: grid;
		place-items: center;
		width: 1.65rem;
		height: 1.65rem;
		padding: 0;
		border: 1px solid #4d5650;
		border-radius: 999px;
		color: #c8ceca;
		background: #252a27;
		cursor: help;
	}
	.help-tip-button:hover,
	.help-tip-button:focus-visible {
		color: white;
		border-color: #78837c;
		outline: none;
	}
	.help-tip {
		position: absolute;
		right: 0;
		bottom: 2.65rem;
		z-index: 20;
		width: min(19rem, calc(100vw - 3rem));
		padding: 0.7rem 0.8rem;
		border: 1px solid #4d5650;
		border-radius: 0.65rem;
		color: #edf0ee;
		background: #202421;
		box-shadow: 0 12px 28px rgb(0 0 0 / 35%);
		font-size: 0.875rem;
		line-height: 1.45;
	}
</style>
