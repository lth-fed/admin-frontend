<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import {
		deleteVoteMeeting,
		deleteVoteMeetingAdmin,
		getVoteMeeting,
		listVoteMeetingAdmins,
		putVoteMeetingAdmin,
		registerVoteClient,
		setVoteRoundOpen
	} from '$lib/api/admin';
	import { frontendError } from '$lib/api/client';
	import type { AdminUser, AdminVoteMeeting, VoteMeetingAdmin, VoteRound } from '$lib/api/types';
	import QrScanner from '$lib/components/QrScanner.svelte';
	import UserList from '$lib/components/UserList.svelte';
	import { localize } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { toasts } from '$lib/toasts.svelte';
	import { loadVisibleMemberOptions } from '$lib/visible-members';
	import { Switch } from '@svar-ui/svelte-core';

	const meetingId = $derived(page.params.id ?? '');

	let meeting = $state<AdminVoteMeeting | null>(null);
	let admins = $state<VoteMeetingAdmin[]>([]);
	let error = $state<string | null>(null);
	let scanning = $state(false);
	let adminReadonly = $state(false);
	let lastScan = $state<string | null>(null);
	let userSuggestions = $state<AdminUser[]>([]);
	let saving = $state(false);

	// Only an explicit `can_edit: false` (Adjuster) hides the controls.
	const canEdit = $derived(meeting?.can_edit !== false);

	const openRounds = $derived(meeting ? meeting.rounds.filter((round) => round.open) : []);
	const closedRounds = $derived(meeting ? meeting.rounds.filter((round) => !round.open) : []);

	$effect(() => {
		if (meetingId) void load(meetingId);
	});

	$effect(() => {
		void loadVisibleMemberOptions()
			.then((users) => (userSuggestions = users))
			.catch(() => (userSuggestions = []));
	});

	async function load(id: string): Promise<void> {
		try {
			[meeting, admins] = await Promise.all([getVoteMeeting(id), listVoteMeetingAdmins(id)]);
			error = null;
		} catch (cause) {
			error = frontendError(cause);
		}
	}

	async function run(action: () => Promise<void>): Promise<void> {
		saving = true;
		try {
			await action();
			await load(meetingId);
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			saving = false;
		}
	}

	function toggleRound(round: VoteRound): Promise<void> {
		return run(() => setVoteRoundOpen(meetingId, { round_id: round.id, open: !round.open }));
	}

	async function addAdmin(userId: string): Promise<void> {
		await run(async () => {
			await putVoteMeetingAdmin(meetingId, { user_id: userId, readonly: adminReadonly });
			toasts.show('success', m.backend_success());
		});
	}

	function removeAdmin(userId: string): Promise<void> {
		return run(() => deleteVoteMeetingAdmin(meetingId, userId));
	}

	async function closeSession(): Promise<void> {
		if (!confirm(m.close_vote_session_confirm())) return;
		saving = true;
		try {
			await deleteVoteMeeting(meetingId);
			toasts.show('success', m.backend_success());
			await goto(resolve('/votes'));
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			saving = false;
		}
	}

	async function onScan(raw: string): Promise<void> {
		lastScan = raw;
		try {
			const payload = JSON.parse(raw) as { cid?: string; t?: number; uid?: string };
			if (!payload.cid || !payload.uid) throw new Error(m.invalid_qr());
			if (typeof payload.t === 'number' && Math.abs(Date.now() - payload.t) > 10 * 60_000) {
				throw new Error(m.qr_expired());
			}
			await registerVoteClient(meetingId, {
				client_id: payload.cid,
				user_id: payload.uid
			});
			scanning = false;
			toasts.show('success', m.backend_success());
		} catch (cause) {
			error = frontendError(cause) ?? m.invalid_qr();
			toasts.show('error', error ?? m.invalid_qr());
		}
	}
</script>

<header class="page-header">
	<div>
		<p class="eyebrow">{m.nav_votes()}</p>
		<h1>{meeting ? localize(meeting.title, '') : m.votes()}</h1>
	</div>
	<div class="toolbar">
		<a class="button-link secondary" href={resolve('/votes')}>{m.back()}</a>
		{#if canEdit}
			<a class="button-link" href={resolve('/votes/[id]/rounds/new', { id: meetingId })}
				>{m.create_round()}</a>
			<button
				class="button-link secondary danger-button"
				type="button"
				disabled={saving}
				onclick={() => void closeSession()}>{m.close_vote_session()}</button>
		{/if}
	</div>
</header>

{#if error}<p class="error-banner" role="alert">{error}</p>{/if}

{#if meeting}
	<div class="stack">
		{#each openRounds as round (round.id)}
			<section class="card card-pad stack">
				<div class="toolbar">
					<h2 class="section-title">{localize(round.title, '')}</h2>
					<span class="pill">{round.open ? m.round_open() : m.round_closed()}</span>
					<span class="pill">{m.max_choices_count({ count: round.max_choices })}</span>
					{#if canEdit}
						<button
							class="button-link secondary"
							type="button"
							disabled={saving}
							onclick={() => void toggleRound(round)}
							>{round.open ? m.close_round() : m.open_round()}</button>
					{/if}
				</div>
				<ul class="vote-results">
					{#each round.alternatives as alternative (alternative.id)}
						<li>
							<span>{localize(alternative.title, '')}</span>
							<span class="pill">{alternative.voted_for}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/each}

		{#if closedRounds.length > 0}
			<details class="card card-pad stack closed-rounds">
				<summary class="section-title">{m.closed_rounds()} ({closedRounds.length})</summary>
				{#each closedRounds as round (round.id)}
					<section class="card card-pad stack">
						<div class="toolbar">
							<h2 class="section-title">{localize(round.title, '')}</h2>
							<span class="pill">{round.open ? m.round_open() : m.round_closed()}</span>
							<span class="pill">{m.max_choices_count({ count: round.max_choices })}</span>
							{#if canEdit}
								<button
									class="button-link secondary"
									type="button"
									disabled={saving}
									onclick={() => void toggleRound(round)}
									>{round.open ? m.close_round() : m.open_round()}</button>
							{/if}
						</div>
						<ul class="vote-results">
							{#each round.alternatives as alternative (alternative.id)}
								<li>
									<span>{localize(alternative.title, '')}</span>
									<span class="pill">{alternative.voted_for}</span>
								</li>
							{/each}
						</ul>
					</section>
				{/each}
			</details>
		{/if}

		<section class="card card-pad stack">
			<div class="toolbar">
				<h2 class="section-title">{m.register_vote_client()}</h2>
				{#if canEdit}
					<button class="button-link" type="button" onclick={() => (scanning = !scanning)}
						>{scanning ? m.cancel() : m.scan_qr()}</button>
				{/if}
			</div>
			{#if scanning && canEdit}
				<QrScanner onscan={(raw) => void onScan(raw)} />
			{/if}
			{#if lastScan}
				<code class="mono">{lastScan}</code>
			{/if}
		</section>

		<section class="card card-pad stack">
			{#if canEdit}
				<div class="stack">
					<p class="muted">{m.vote_admin_role_help()}</p>
					<label class="switch-field">
						<Switch value={adminReadonly} onchange={({ value }) => (adminReadonly = value)} />
						<span>{m.new_admin_is_adjuster()}</span>
					</label>
				</div>
			{/if}
			<UserList
				title={m.vote_admins()}
				items={admins}
				suggestions={userSuggestions}
				allowEmailInvite
				readonly={!canEdit}
				addLabel={m.user_id()}
				addText={m.add()}
				removeText={m.remove()}
				onadd={addAdmin}
				onremove={removeAdmin} />
		</section>
	</div>
{/if}

<style>
	.closed-rounds > summary {
		cursor: pointer;
	}
	.vote-results {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.vote-results li {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--border, #ddd);
	}
</style>
