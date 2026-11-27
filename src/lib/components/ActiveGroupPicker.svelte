<script lang="ts">
	import type { Group } from '$lib/api/types';
	import { administrableGroups, rememberActiveGroup } from '$lib/active-group';
	import { localize } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';

	let {
		pageKey,
		groups,
		adminGroupIds,
		value,
		label = m.active_group(),
		onchange
	}: {
		/** Page identity used to remember the selection, e.g. `products` or `stock`. */
		pageKey: string;
		groups: Group[];
		adminGroupIds: string[];
		value: string;
		label?: string;
		onchange: (groupId: string) => void;
	} = $props();

	const options = $derived(administrableGroups(groups, adminGroupIds));

	function select(event: Event): void {
		const groupId = (event.currentTarget as HTMLSelectElement).value;
		rememberActiveGroup(pageKey, groupId);
		onchange(groupId);
	}
</script>

<label class="field active-group-picker">
	<span>{label}</span>
	<select {value} disabled={options.length === 0} onchange={select}>
		{#each options as group (group.id)}
			<option value={group.id}>{group.path} · {localize(group.name, group.path)}</option>
		{:else}
			<option value="">{m.active_group_none()}</option>
		{/each}
	</select>
</label>

<style>
	.active-group-picker {
		min-width: 15rem;
	}
</style>
