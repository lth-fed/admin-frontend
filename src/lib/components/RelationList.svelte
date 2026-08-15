<script lang="ts">
	import type { Group } from '$lib/api/types';
	import GroupTreePicker from '$lib/components/GroupTreePicker.svelte';

	let {
		title,
		items,
		options,
		inheritDescendants = false,
		onadd,
		onremove
	}: {
		title: string;
		items: Group[];
		options: Group[];
		inheritDescendants?: boolean;
		onadd: (value: string) => void | Promise<void>;
		onremove: (value: string) => void | Promise<void>;
	} = $props();
	async function update(ids: string[]): Promise<void> {
		const current = new Set(items.map((item) => item.id));
		for (const id of ids.filter((id) => !current.has(id))) await onadd(id);
		for (const id of [...current].filter((id) => !ids.includes(id))) await onremove(id);
	}
</script>

<GroupTreePicker
	{title}
	groups={options}
	selectedIds={items.map((item) => item.id)}
	{inheritDescendants}
	onchange={update} />
