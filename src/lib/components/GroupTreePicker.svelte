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
		disabledIds = [],
		disabledTitle,
		inheritDescendants = false,
		onchange
	}: {
		title?: string;
		groups: Group[];
		selectedIds: string[];
		disabled?: boolean;
		/** Selected groups whose access is owned by another setting. */
		disabledIds?: string[];
		/** Native tooltip shown when the picker is disabled. */
		disabledTitle?: string;
		/** A selected group grants access to every group below it in the path tree. */
		inheritDescendants?: boolean;
		onchange: (ids: string[]) => void | Promise<void>;
	} = $props();

	const selectedPaths = $derived(
		groups.filter((group) => selectedIds.includes(group.id)).map((group) => group.path)
	);
	const disabledPaths = $derived(
		groups.filter((group) => disabledIds.includes(group.id)).map((group) => group.path)
	);

	function inherited(group: Group): boolean {
		return (
			inheritDescendants &&
			selectedPaths.some((path) => group.path !== path && group.path.startsWith(`${path}.`))
		);
	}

	function locked(group: Group): boolean {
		return (
			disabled ||
			disabledIds.includes(group.id) ||
			(inheritDescendants && disabledPaths.some((path) => group.path.startsWith(`${path}.`)))
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
	{#if title}
		<h3 class="section-title">{title}</h3>
	{/if}
	<div class="group-tree-picker">
		<GroupTreeExplorer {groups} revealIds={selectedIds}>
			{#snippet children(row)}
				{@const isInherited = inherited(row.group)}
				{@const isLocked = locked(row.group)}
				<label
					class="host-tree-check"
					class:inherited-selection={isInherited}
					title={isLocked ? disabledTitle : undefined}>
					<input
						type="checkbox"
						disabled={isLocked || isInherited}
						title={isLocked ? disabledTitle : undefined}
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
