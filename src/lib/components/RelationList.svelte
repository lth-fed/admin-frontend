<script lang="ts">
	import type { Group } from '$lib/api/types';
	import { localize } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { Select } from '@svar-ui/svelte-core';

	let {
		title,
		items,
		options,
		placeholder,
		onadd,
		onremove
	}: {
		title: string;
		items: Group[];
		options: Group[];
		placeholder: string;
		onadd: (value: string) => void | Promise<void>;
		onremove: (value: string) => void | Promise<void>;
	} = $props();
	let value = $state('');
	let busy = $state(false);

	async function add(): Promise<void> {
		if (!value) return;
		busy = true;
		try {
			await onadd(value);
			value = '';
		} finally {
			busy = false;
		}
	}
</script>

<div>
	<h3 class="section-title">{title}</h3>
	<div class="toolbar">
		<div class="field" style="flex: 1">
			<span>{placeholder}</span>
			<Select
				{value}
				options={options
					.filter((group) => !items.some((item) => item.id === group.id))
					.map((group) => ({ id: group.id, label: localize(group.name, group.path) }))}
				onchange={({ value: next }) => (value = String(next))} />
		</div>
		<button
			class="button-link secondary"
			type="button"
			disabled={busy || !value}
			onclick={() => void add()}>{m.add()}</button>
	</div>
	{#if items.length === 0}<p class="muted">{m.empty()}</p>{:else}<ul class="list">
			{#each items as item (item.id)}<li>
					<div class="list-main">
						<strong>{localize(item.name, item.path)}</strong><span>{item.path}</span>
					</div>
					<button
						class="button-link secondary danger-button"
						type="button"
						disabled={busy}
						onclick={() => void onremove(item.id)}>{m.remove()}</button>
				</li>{/each}
		</ul>{/if}
</div>
