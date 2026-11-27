<script lang="ts">
	import { Combo } from '@svar-ui/svelte-core';
	import type { Component, Snippet } from 'svelte';

	type Option = { id: string; label: string };
	const SearchCombo = Combo as Component<{
		value?: string;
		options?: Option[];
		placeholder?: string;
		clear?: boolean;
		onchange?: (event: { value: string | number }) => void;
		children?: Snippet<[{ option: Option }]>;
	}>;

	let {
		value,
		options,
		label,
		placeholder = label,
		onchange
	}: {
		value: string;
		options: Option[];
		label: string;
		placeholder?: string;
		onchange: (id: string) => void;
	} = $props();

	// The parent owns the value. Combo keeps its own text, so a one-way binding is enough and
	// there is no local state that can override the user's pick.
	function pick(next: string): void {
		// Combo also holds half-typed text; only a real option (or clearing) is a selection.
		if (next === '' || options.some((option) => option.id === next)) onchange(next);
	}
</script>

<label class="field"
	><span>{label}</span>
	<SearchCombo
		{value}
		{options}
		{placeholder}
		onchange={({ value: next }) => pick(String(next))}
		clear>
		{#snippet children({ option })}
			<span>{option.label}</span>
		{/snippet}
	</SearchCombo></label>
