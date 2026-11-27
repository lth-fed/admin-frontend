<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { createVoteRound, getVoteMeeting } from '$lib/api/admin';
	import { frontendError } from '$lib/api/client';
	import type { AdminVoteMeeting } from '$lib/api/types';
	import LocalizedField from '$lib/components/LocalizedField.svelte';
	import { localize } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { toasts } from '$lib/toasts.svelte';
	import { onMount } from 'svelte';

	const meetingId = $derived(page.params.id ?? '');

	type Row = { sv: string; en: string };

	let meeting = $state<AdminVoteMeeting | null>(null);
	let title = $state<Record<string, string>>({ sv: '', en: '' });
	let maxChoices = $state(1);
	let rows = $state<Row[]>([]);
	let loading = $state(true);
	let saving = $state(false);
	let error = $state<string | null>(null);

	const draftKey = $derived(`vote-round-draft:${meetingId}`);

	onMount(async () => {
		try {
			const loaded = await getVoteMeeting(meetingId);
			meeting = loaded;
			const previous = loaded.rounds.at(-1);
			let restored = false;
			try {
				const stored = localStorage.getItem(draftKey);
				if (stored) {
					const draft = JSON.parse(stored) as {
						title?: Record<string, string>;
						maxChoices?: number;
						rows?: Row[];
					};
					if (draft.rows?.length) {
						title = draft.title ?? title;
						maxChoices = draft.maxChoices ?? maxChoices;
						rows = draft.rows;
						restored = true;
					}
				}
			} catch {
				// A corrupt draft is simply ignored.
			}
			if (!restored && previous) {
				title = {
					sv: `${localize(previous.title, '')} 2`,
					en: `${localize(previous.title, '')} 2`
				};
				maxChoices = previous.max_choices;
				rows = previous.alternatives
					.map((alternative) => ({
						sv: alternative.title.sv ?? localize(alternative.title, ''),
						en: alternative.title.en ?? localize(alternative.title, '')
					}))
					.filter((row) => row.sv.trim() || row.en.trim());
			}
			if (!rows.some((row) => row.sv.trim().toLowerCase() === 'blank')) {
				rows = [...rows, { sv: 'Blank', en: 'Blank' }];
			}
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			loading = false;
		}
	});

	$effect(() => {
		if (loading) return;
		try {
			localStorage.setItem(draftKey, JSON.stringify({ title, maxChoices, rows }));
		} catch {
			// Saving the draft is best-effort.
		}
	});

	function addRow(): void {
		rows = [...rows, { sv: '', en: '' }];
	}

	function removeRow(index: number): void {
		rows = rows.filter((_, current) => current !== index);
	}

	async function create(): Promise<void> {
		saving = true;
		error = null;
		try {
			const alternatives = rows
				.filter((row) => row.sv.trim() || row.en.trim())
				.map((row) => ({ sv: row.sv.trim(), en: row.en.trim() || row.sv.trim() }));
			await createVoteRound(meetingId, { title, max_choices: maxChoices, alternatives });
			try {
				localStorage.removeItem(draftKey);
			} catch {
				// ignore
			}
			toasts.show('success', m.backend_success());
			await goto(resolve('/votes/[id]', { id: meetingId }));
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			saving = false;
		}
	}
</script>

<header class="page-header">
	<div>
		<p class="eyebrow">{m.votes()} · {meeting ? localize(meeting.title, '') : ''}</p>
		<h1>{m.create_round()}</h1>
	</div>
	<div class="toolbar">
		<a class="button-link secondary" href={resolve('/votes/[id]', { id: meetingId })}>{m.back()}</a>
	</div>
</header>

{#if loading}
	<div class="center-stage">
		<div class="loader"></div>
		<p>{m.loading()}</p>
	</div>
{:else}
	<form
		class="stack"
		novalidate
		onsubmit={(event) => {
			event.preventDefault();
			void create();
		}}>
		{#if error}<p class="error-banner" role="alert">{error}</p>{/if}
		<p class="muted">{m.vote_round_draft_help()}</p>

		<section class="card card-pad stack">
			<LocalizedField
				value={title}
				labelSv={m.name_sv()}
				labelEn={m.name_en()}
				onchange={(value) => (title = value)} />
			<label class="field"
				><span>{m.max_choices()}</span>
				<input type="number" min="1" bind:value={maxChoices} /></label>
		</section>

		<section class="card card-pad stack">
			<div class="toolbar">
				<h2 class="section-title">{m.alternatives()}</h2>
				<button class="button-link secondary" type="button" onclick={addRow}
					>{m.add_alternative()}</button>
			</div>
			{#each rows as row, index (index)}
				<div class="grid-2">
					<label class="field"
						><span>{m.name_sv()}</span>
						<input type="text" bind:value={row.sv} /></label>
					<label class="field"
						><span>{m.name_en()}</span>
						<input type="text" bind:value={row.en} /></label>
					<button
						class="button-link secondary danger-button"
						type="button"
						onclick={() => removeRow(index)}>{m.remove()}</button>
				</div>
			{/each}
		</section>

		<div class="editor-action-dock">
			<button class="button-link" type="submit" disabled={saving}
				>{saving ? m.saving() : m.create_round()}</button>
		</div>
	</form>
{/if}
