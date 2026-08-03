<script lang="ts">
	import { resolve } from '$app/paths';
	import { getMe, listGroupTree } from '$lib/api/admin';
	import { frontendError } from '$lib/api/client';
	import type { Group } from '$lib/api/types';
	import { localize } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';

	let groups = $state<Group[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let adminGroupIds = $state<string[]>([]);

	$effect(() => {
		void (async () => {
			try {
				const [tree, me] = await Promise.all([listGroupTree(), getMe()]);
				groups = tree.sort((a, b) => a.path.localeCompare(b.path));
				adminGroupIds = me.admin_group_ids;
			} catch (cause) {
				error = frontendError(cause);
			} finally {
				loading = false;
			}
		})();
	});

	function isDirectAdmin(group: Group): boolean {
		return adminGroupIds.includes(group.id);
	}

	function isParentAdmin(group: Group): boolean {
		const parentPath = group.path.slice(0, group.path.lastIndexOf('.'));
		const parent = groups.find((candidate) => candidate.path === parentPath);
		return parent !== undefined && adminGroupIds.includes(parent.id);
	}
</script>

<svelte:head><title>{m.groups_title()} · {m.app_name()}</title></svelte:head>

<header class="page-header">
	<div>
		<p class="eyebrow">{m.nav_groups()}</p>
		<h1>{m.groups_title()}</h1>
		<p class="muted">{m.groups_description()}</p>
	</div>
</header>

{#if error}<p class="error-banner" role="alert">{error}</p>{/if}
<section class="card card-pad">
	{#if loading}<div class="loader"></div>{:else if groups.length === 0}<p class="empty-state">
			{m.empty()}
		</p>{:else}
		<ul class="list">
			{#each groups as group (group.id)}
				<li
					class:administered={isDirectAdmin(group)}
					style={`padding-left: ${Math.max(0, group.path.split('.').length - 1) * 16}px`}>
					<div class="list-main">
						<strong>{localize(group.name, group.path)}</strong><span>{group.path}</span>
					</div>
					<div class="toolbar">
						{#if group.deleted}<span class="pill hidden">{m.hidden()}</span>{/if}
						{#if isDirectAdmin(group)}<span class="pill">{m.direct_admin()}</span>{/if}
						{#if isDirectAdmin(group) || isParentAdmin(group)}<a
								class="button-link secondary"
								href={resolve('/groups/[id]', { id: group.id })}
								>{isDirectAdmin(group) ? m.edit() : m.manage_admins()}</a
							>{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>
