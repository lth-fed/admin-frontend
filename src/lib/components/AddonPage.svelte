<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount, tick } from 'svelte';
	import {
		getActivity,
		getMe,
		getTicketKind,
		listActivityAddons,
		listActivityTicketKinds,
		saveActivityAddon,
		saveTicketKind,
		deleteActivityAddon
	} from '$lib/api/admin';
	import { frontendError } from '$lib/api/client';
	import type { PutTicketKind, TicketKind } from '$lib/api/types';
	import { validAddons } from '$lib/addon-validation';
	import AddonFields from './AddonFields.svelte';
	import { localize } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { ArrowLeft, Trash2 } from '@lucide/svelte';

	let { id, activityId }: { id: string | null; activityId: string } = $props();
	let addon = $state<PutTicketKind['addons'][number] | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let canEdit = $state(false);
	let locked = $state(false);
	let assigned = $state(false);
	let ticketKinds = $state<TicketKind[]>([]);
	let selectedKindIds = $state<string[]>([]);
	let activityName = $state('');
	let showErrors = $state(false);
	let snapshot = $state('');
	let allowNavigation = $state(false);
	let formElement = $state<HTMLFormElement>();
	const dirty = $derived(snapshot !== '' && serialize() !== snapshot);

	function serialize(): string {
		return JSON.stringify({ addon, selectedKindIds: [...selectedKindIds].sort() });
	}

	beforeNavigate(({ cancel, willUnload }) => {
		if (dirty && !allowNavigation && (willUnload || !confirm(m.unsaved_changes()))) cancel();
	});
	onMount(() => {
		void load();
	});

	async function load(): Promise<void> {
		try {
			if (!activityId) throw new Error(m.not_found());
			const [activity, me, addons, tickets] = await Promise.all([
				getActivity(activityId),
				getMe(),
				listActivityAddons(activityId),
				listActivityTicketKinds(activityId)
			]);
			canEdit = me.admin_group_ids.some(
				(groupId) =>
					groupId === activity.creator_id || activity.hosts.some((host) => host.id === groupId)
			);
			const kinds = await Promise.all(tickets.map((ticket) => getTicketKind(ticket.id)));
			activityName = localize(activity.title);
			const linked = kinds.filter((kind) => kind.available_addons.some((item) => item.id === id));
			ticketKinds = kinds.filter((kind) => !kind.for_visibility);
			selectedKindIds = linked.map((kind) => kind.ticket_kind_id);
			assigned = linked.length > 0;
			locked = linked.some((kind) => kind.has_been_purchased);
			addon = id
				? (addons.find((item) => item.id === id) ?? null)
				: {
						id: crypto.randomUUID(),
						name: { sv: '', en: '' },
						required: false,
						multiple_alternatives: false,
						has_text_field: false,
						options: []
					};
			if (!addon) throw new Error(m.not_found());
			snapshot = serialize();
		} catch (cause) {
			error = frontendError(cause) ?? m.error_title();
		} finally {
			loading = false;
		}
	}

	async function save(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!addon || !canEdit || saving) return;
		showErrors = true;
		if (!validAddons([addon])) {
			error = m.ticket_addons_invalid();
			await tick();
			const invalid = formElement?.querySelector<HTMLElement>(
				'[aria-invalid="true"], .field-error input, .field-error select'
			);
			invalid?.focus();
			invalid?.scrollIntoView({ block: 'center', behavior: 'smooth' });
			return;
		}
		saving = true;
		error = null;
		try {
			await saveActivityAddon(activityId, $state.snapshot(addon));
			for (const kind of ticketKinds) {
				const selected = selectedKindIds.includes(kind.ticket_kind_id);
				if (selected === kind.available_addons.some((item) => item.id === addon!.id)) continue;
				const current = await getTicketKind(kind.ticket_kind_id);
				const addons = current.available_addons.filter((item) => item.id !== addon!.id);
				if (selected) addons.push($state.snapshot(addon));
				await saveTicketKind(kind.ticket_kind_id, {
					...current,
					name: current.ticket_kind_name,
					addons
				});
				kind.available_addons = addons;
				assigned = ticketKinds.some((item) =>
					item.available_addons.some((entry) => entry.id === addon!.id)
				);
			}
			snapshot = serialize();
			if (!id) {
				allowNavigation = true;
				await goto(
					resolve(`/addons/[id]?activity=${encodeURIComponent(activityId)}`, { id: addon.id }),
					{ replaceState: true }
				);
			}
		} catch (cause) {
			allowNavigation = false;
			error = frontendError(cause) ?? m.error_title();
		} finally {
			saving = false;
		}
	}

	async function remove(): Promise<void> {
		if (!id || !canEdit || assigned || saving || !confirm(m.delete_addon_confirm())) return;
		saving = true;
		try {
			await deleteActivityAddon(activityId, id);
			allowNavigation = true;
			await goto(resolve('/activities/[id]?tab=tickets', { id: activityId }));
		} catch (cause) {
			allowNavigation = false;
			error = frontendError(cause) ?? m.error_title();
		} finally {
			saving = false;
		}
	}
</script>

<header class="page-header edit-page-header">
	<div>
		<p class="eyebrow">{m.addons()}</p>
		<h1>
			{id ? m.edit_addon() : m.create_new_addon()}{addon
				? ` · ${localize(addon.name, '').trim() || m.empty_addon()}`
				: ''}
		</h1>
	</div>
	<a
		class="button-link secondary"
		href={activityId ? resolve('/activities/[id]?tab=tickets', { id: activityId }) : resolve('/')}
		><ArrowLeft size={18} /> {m.back()}</a>
</header>
{#if error}<p class="error-banner" role="alert">{error}</p>{/if}
{#if loading}<div class="center-stage">
		<div class="loader"></div>
		<p>{m.loading()}</p>
	</div>
{:else if addon}
	{#if !canEdit}<p class="info-banner">{m.activity_read_only()}</p>{/if}
	<form class="stack" novalidate onsubmit={save} bind:this={formElement}>
		<AddonFields
			{addon}
			disabled={!canEdit || saving}
			{locked}
			{showErrors}
			onchange={(value) => (addon = value)} />
		<section class="card card-pad stack">
			<h2 class="section-title">{m.addon_ticket_kinds()}</h2>
			<p class="muted">{activityName}</p>
			<p class="muted">{m.addon_assignment_help()}</p>
			{#each ticketKinds as kind (kind.ticket_kind_id)}
				<label class="switch-field">
					<input
						type="checkbox"
						checked={selectedKindIds.includes(kind.ticket_kind_id)}
						disabled={!canEdit || saving || kind.has_been_purchased}
						onchange={(event) => {
							selectedKindIds = selectedKindIds.filter((kindId) => kindId !== kind.ticket_kind_id);
							if (event.currentTarget.checked)
								selectedKindIds = [...selectedKindIds, kind.ticket_kind_id];
						}} />
					<span>{localize(kind.ticket_kind_name)}</span>
				</label>
			{:else}<p class="empty-state">{m.empty()}</p>{/each}
		</section>
		<div class="editor-action-dock">
			<button class="button-link" type="submit" disabled={!canEdit || saving}
				>{saving ? m.saving() : m.save()}</button>
			{#if id}<button
					class="button-link secondary danger-button"
					type="button"
					disabled={!canEdit || saving || assigned}
					title={assigned ? m.unassign_addon_before_delete() : undefined}
					onclick={() => void remove()}><Trash2 size={17} /> {m.remove()}</button
				>{/if}
		</div>
	</form>
{/if}
