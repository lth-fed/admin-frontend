<script lang="ts">
	import type { Group } from '$lib/api/types';
	import GroupIcon from '$lib/components/GroupIcon.svelte';
	import GroupTreeExplorer from '$lib/components/GroupTreeExplorer.svelte';
	import { localize } from '$lib/i18n';

	let {
		title,
		groups,
		selectedIds,
		disabled = false,
		inheritDescendants = false,
		onchange
	}: {
		title: string;
		groups: Group[];
		selectedIds: string[];
		disabled?: boolean;
		/** A selected group grants access to every group below it in the path tree. */
		inheritDescendants?: boolean;
		onchange: (ids: string[]) => void | Promise<void>;
	} = $props();

	const selectedPaths = $derived(
		groups.filter((group) => selectedIds.includes(group.id)).map((group) => group.path)
	);

	function inherited(group: Group): boolean {
		return (
			inheritDescendants &&
			selectedPaths.some((path) => group.path !== path && group.path.startsWith(`${path}.`))
		);
	}

	function normalize(ids: string[]): string[] {
		if (!inheritDescendants) return ids;
		const selected = groups.filter((group) => ids.includes(group.id));
		const explicit = selected
			.filter(
				(group) =>
					!selected.some(
						(candidate) => candidate.id !== group.id && group.path.startsWith(`${candidate.path}.`)
					)
			)
			.map((group) => group.id);
		const knownIds = new Set(groups.map((group) => group.id));
		return [...explicit, ...ids.filter((id) => !knownIds.has(id))];
	}

	function toggle(id: string, checked: boolean): void {
		const ids = checked ? [...new Set([...selectedIds, id])] : selectedIds.filter((x) => x !== id);
		void onchange(normalize(ids));
	}
</script>

<div>
	<h3 class="section-title">{title}</h3>
	<div class="group-tree-picker">
		<GroupTreeExplorer {groups} revealIds={selectedIds}>
			{#snippet children(row)}
				{@const isInherited = inherited(row.group)}
				<label class="host-tree-check" class:inherited-selection={isInherited}>
					<input
						type="checkbox"
						disabled={disabled || isInherited}
						checked={selectedIds.includes(row.group.id) || isInherited}
						onchange={(event) => toggle(row.group.id, event.currentTarget.checked)} />
					<GroupIcon url={row.group.logo_url} name={localize(row.group.name, row.group.path)} />
					<span>{localize(row.group.name, row.group.path)}</span>
					<small>{row.group.path}</small>
				</label>
			{/snippet}
		</GroupTreeExplorer>
	</div>
</div>
