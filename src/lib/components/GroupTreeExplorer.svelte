<script lang="ts" module>
	export type GroupTreeRow = {
		group: Group;
		depth: number;
		hasChildren: boolean;
	};
</script>

<script lang="ts">
	import type { Group } from '$lib/api/types';
	import { localize } from '$lib/i18n';
	import { ChevronDown, ChevronRight } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';

	let {
		groups,
		revealIds = [],
		children
	}: {
		groups: Group[];
		revealIds?: string[];
		children: Snippet<[GroupTreeRow]>;
	} = $props();

	const expanded = new SvelteSet<string>();
	const revealed = new SvelteSet<string>();

	$effect(() => {
		const byPath = new Map(groups.map((group) => [group.path, group]));
		for (const id of revealIds) {
			if (revealed.has(id)) continue;
			const selected = groups.find((group) => group.id === id);
			if (!selected) continue;
			const parts = selected.path.split('.');
			for (let index = 1; index < parts.length; index += 1) {
				const ancestor = byPath.get(parts.slice(0, index).join('.'));
				if (ancestor) expanded.add(ancestor.id);
			}
			revealed.add(id);
		}
	});

	const rows = $derived.by(() => {
		const sorted = [...groups].sort((a, b) => a.path.localeCompare(b.path));
		const byPath = new Map(sorted.map((group) => [group.path, group]));
		const parentPaths = new Set(
			sorted.map((group) => group.path.slice(0, group.path.lastIndexOf('.'))).filter(Boolean)
		);
		return sorted
			.filter((group) => {
				const parts = group.path.split('.');
				for (let index = 1; index < parts.length; index += 1) {
					const ancestor = byPath.get(parts.slice(0, index).join('.'));
					if (ancestor && !expanded.has(ancestor.id)) return false;
				}
				return true;
			})
			.map((group) => ({
				group,
				depth: group.path
					.split('.')
					.slice(0, -1)
					.filter((_, index, parts) => byPath.has(parts.slice(0, index + 1).join('.'))).length,
				hasChildren: parentPaths.has(group.path)
			}));
	});

	function toggle(id: string): void {
		if (expanded.has(id)) expanded.delete(id);
		else expanded.add(id);
	}
</script>

<div class="host-tree group-tree-explorer">
	{#each rows as row (row.group.id)}
		<div class="host-tree-row" style={`padding-left: ${row.depth * 20 + 8}px`}>
			{#if row.hasChildren}
				<button
					class="tree-toggle"
					type="button"
					aria-label={localize(row.group.name, row.group.path)}
					aria-expanded={expanded.has(row.group.id)}
					onclick={() => toggle(row.group.id)}>
					{#if expanded.has(row.group.id)}<ChevronDown size={17} />{:else}<ChevronRight
							size={17} />{/if}
				</button>
			{:else}<span class="tree-toggle-spacer"></span>{/if}
			{@render children(row)}
		</div>
	{/each}
</div>
