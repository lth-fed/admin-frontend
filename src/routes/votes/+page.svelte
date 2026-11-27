<script lang="ts">
	import { resolve } from '$app/paths';
	import { createVoteMeeting, getMe, listGroupTree, listVoteMeetings } from '$lib/api/admin';
	import { frontendError } from '$lib/api/client';
	import type { Group, VoteMeeting } from '$lib/api/types';
	import LocalizedField from '$lib/components/LocalizedField.svelte';
	import { localize, sortByLocalizedName } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { toasts } from '$lib/toasts.svelte';
	import { onMount } from 'svelte';
	import { Switch } from '@svar-ui/svelte-core';

	let groups = $state<Group[]>([]);
	let adminGroupIds = $state<string[]>([]);
	let selectedGroupId = $state('');
	let meetings = $state<VoteMeeting[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let title = $state<Record<string, string>>({ sv: '', en: '' });
	let secure = $state(false);

	const availableGroups = $derived(
		sortByLocalizedName(
			groups.filter((group) => adminGroupIds.includes(group.id)),
			(group) => group.name
		)
	);

	onMount(async () => {
		try {
			const [me, tree] = await Promise.all([getMe(), listGroupTree()]);
			adminGroupIds = me.admin_group_ids;
			groups = tree;
			selectedGroupId = availableGroups[0]?.id ?? '';
			if (selectedGroupId) await refresh(selectedGroupId);
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			loading = false;
		}
	});

	async function refresh(groupId: string): Promise<void> {
		try {
			meetings = await listVoteMeetings(groupId);
			error = null;
		} catch (cause) {
			error = frontendError(cause);
		}
	}

	async function create(): Promise<void> {
		if (!selectedGroupId) return;
		try {
			await createVoteMeeting({ group_id: selectedGroupId, secure_voting: secure, title });
			title = { sv: '', en: '' };
			secure = false;
			await refresh(selectedGroupId);
			toasts.show('success', m.backend_success());
		} catch (cause) {
			error = frontendError(cause);
		}
	}
</script>

<header class="page-header">
	<div>
		<p class="eyebrow">{m.nav_votes()}</p>
		<h1>{m.votes()}</h1>
	</div>
</header>

{#if loading}
	<div class="center-stage">
		<div class="loader"></div>
		<p>{m.loading()}</p>
	</div>
{:else if availableGroups.length === 0}
	<p class="empty-state">{m.votes_no_group()}</p>
{:else}
	<div class="stack">
		{#if error}<p class="error-banner" role="alert">{error}</p>{/if}
		<label class="field"
			><span>{m.group()}</span>
			<select
				bind:value={selectedGroupId}
				onchange={() => selectedGroupId && void refresh(selectedGroupId)}>
				{#each availableGroups as group (group.id)}
					<option value={group.id}>{localize(group.name, group.path)}</option>
				{/each}
			</select></label>

		<section class="card card-pad stack">
			<h2 class="section-title">{m.vote_meetings()}</h2>
			{#if meetings.length === 0}
				<p class="empty-state">{m.empty()}</p>
			{:else}
				<ul class="list">
					{#each meetings as meeting (meeting.id)}
						<li>
							<div class="list-main">
								<strong>{localize(meeting.title, '')}</strong>
								<span>{meeting.secure_voting ? m.secure_voting() : m.open_voting()}</span>
							</div>
							<a class="button-link secondary" href={resolve('/votes/[id]', { id: meeting.id })}
								>{m.open()}</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="card card-pad stack">
			<h2 class="section-title">{m.create_vote()}</h2>
			<LocalizedField
				value={title}
				labelSv={m.name_sv()}
				labelEn={m.name_en()}
				onchange={(value) => (title = value)} />
			<label class="switch-field">
				<Switch value={secure} onchange={({ value }) => (secure = value)} />
				<span>{m.secure_voting()}</span>
			</label>
			<button class="button-link" type="button" onclick={() => void create()}
				>{m.create_vote()}</button>
		</section>
	</div>
{/if}
