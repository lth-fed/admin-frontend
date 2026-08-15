<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Pathname } from '$app/types';
	import { getMe, listGroupTree } from '$lib/api/admin';
	import { frontendError } from '$lib/api/client';
	import type { Group } from '$lib/api/types';
	import GroupIcon from '$lib/components/GroupIcon.svelte';
	import GroupTreeExplorer from '$lib/components/GroupTreeExplorer.svelte';
	import { localize } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { Plus } from '@lucide/svelte';

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

	function hasDirectAdminParent(group: Group): boolean {
		const separator = group.path.lastIndexOf('.');
		if (separator === -1) return false;
		const parentPath = group.path.slice(0, separator);
		const parent = groups.find((candidate) => candidate.path === parentPath);
		return parent !== undefined && isDirectAdmin(parent);
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
		<div class="group-admin-tree">
			<GroupTreeExplorer {groups} revealIds={adminGroupIds}>
				{#snippet children(row)}
					{@const group = row.group}
					<article class="group-admin-row" class:administered={isDirectAdmin(group)}>
						<div class="list-main">
							<div class="group-list-name">
								<GroupIcon url={group.logo_url} name={localize(group.name, group.path)} size={34} />
								<div>
									<strong>{localize(group.name, group.path)}</strong><span>{group.path}</span>
								</div>
							</div>
						</div>
						<div class="toolbar">
							{#if group.deleted}<span class="pill hidden">{m.hidden()}</span>{/if}
							{#if isDirectAdmin(group)}<span class="pill">{m.direct_admin()}</span>{/if}
							{#if isDirectAdmin(group)}<a
									class="icon-button"
									href={resolve(`/groups/${group.id}/new` as Pathname)}
									aria-label={m.create_child_group()}
									title={m.create_child_group()}><Plus size={19} /></a
								>{/if}
							{#if isDirectAdmin(group)}<a
									class="button-link secondary"
									href={resolve('/groups/[id]', { id: group.id })}>{m.edit()}</a
								>{/if}
							{#if !isDirectAdmin(group) && hasDirectAdminParent(group)}<a
									class="button-link secondary"
									href={resolve('/groups/[id]', { id: group.id })}>{m.manage_admins()}</a
								>{/if}
						</div>
					</article>
				{/snippet}
			</GroupTreeExplorer>
		</div>
	{/if}
</section>
