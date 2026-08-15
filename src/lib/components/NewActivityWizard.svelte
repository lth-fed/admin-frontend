<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		getMe,
		inviteActivityHost,
		listGroupTree,
		saveActivity,
		saveNotification,
		saveTicketKind
	} from '$lib/api/admin';
	import { frontendError } from '$lib/api/client';
	import type { Group, PutActivity, PutTicketKind, PutTicketNotification } from '$lib/api/types';
	import AddonEditor from '$lib/components/AddonEditor.svelte';
	import ActivityDetailsFields from '$lib/components/ActivityDetailsFields.svelte';
	import ActivityLocationFields from '$lib/components/ActivityLocationFields.svelte';
	import ActivityTabs from '$lib/components/ActivityTabs.svelte';
	import GroupTreePicker from '$lib/components/GroupTreePicker.svelte';
	import NotificationFields from '$lib/components/NotificationFields.svelte';
	import TicketFields from '$lib/components/TicketFields.svelte';
	import { localize } from '$lib/i18n';
	import { uploadImage } from '$lib/image';
	import * as m from '$lib/paraglide/messages';
	import {
		applyTicketPreset,
		createDietaryPreferencesAddon,
		hasDietaryPreferencesAddon,
		setDietaryPreferencesAddon,
		type TicketPresetId,
		UNLIMITED_TICKETS
	} from '$lib/ticket-presets';
	import { toasts } from '$lib/toasts.svelte';
	import { ArrowLeft, Plus, Trash2 } from '@lucide/svelte';
	import { Select, Switch } from '@svar-ui/svelte-core';

	type TicketDraft = { id: string; preset: TicketPresetId; dietary: boolean; body: PutTicketKind };
	type NotificationDraft = {
		id: string;
		target: string;
		kind: string;
		body: PutTicketNotification;
	};

	const activityId = crypto.randomUUID();
	const steps = [
		m.creation_step_details(),
		m.creation_step_logistics(),
		m.creation_step_tickets(),
		m.creation_step_notifications()
	];
	let step = $state(0);
	let loading = $state(true);
	let saving = $state(false);
	let uploading = $state(false);
	let error = $state<string | null>(null);
	let groups = $state<Group[]>([]);
	let adminGroupIds = $state<string[]>([]);
	let imageUrl = $state('');
	let contactKind = $state<'mailto' | 'tel'>('mailto');
	let north = $state('');
	let east = $state('');
	let organizerIds = $state<string[]>([]);
	let visibilityGroupIds = $state<string[]>([]);
	let hasTickets = $state(true);
	let limitCapacity = $state(false);
	let tickets = $state<TicketDraft[]>([newTicketDraft()]);
	let notifications = $state<NotificationDraft[]>([]);
	let activity = $state<PutActivity>({
		responsible_name: '',
		responsible_contact: '',
		creator_id: '',
		title: { sv: '', en: '' },
		description: { sv: '', en: '' },
		location: { name: { sv: '', en: '' }, directions: { sv: '', en: '' }, url: '' },
		time_start: new Date(Date.now() + 86_400_000).toISOString(),
		time_end: new Date(Date.now() + 90_000_000).toISOString(),
		image_id: '',
		is_hidden: true,
		is_hidden_for_other_admins: false,
		max_tickets: UNLIMITED_TICKETS,
		host_ids: []
	});
	const contactValue = $derived(activity.responsible_contact.replace(/^(mailto:|tel:)/, ''));

	$effect(() => {
		void load();
	});

	function newTicketDraft(): TicketDraft {
		const id = crypto.randomUUID();
		return {
			id,
			preset: 'simple',
			dietary: true,
			body: {
				activity_id: activityId,
				name: { sv: '', en: '' },
				price: 0,
				purchasing_available_start: new Date().toISOString(),
				purchasing_available_stop: new Date(Date.now() + 86_400_000).toISOString(),
				max_tickets: 1,
				min_tickets: 0,
				allow_transfer_ticket_start: new Date().toISOString(),
				allow_transfer_ticket_stop: new Date().toISOString(),
				allow_transfer_ticket_bypass_allowed_groups: false,
				allowed_group_ids: [],
				addons: [createDietaryPreferencesAddon()]
			}
		};
	}

	async function load(): Promise<void> {
		try {
			const [me, tree] = await Promise.all([getMe(), listGroupTree()]);
			groups = tree;
			adminGroupIds = me.admin_group_ids;
			activity.creator_id = me.admin_group_ids[0] ?? '';
			activity.responsible_name = me.name;
			if (me.id.startsWith('email:')) activity.responsible_contact = `mailto:${me.id.slice(6)}`;
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			loading = false;
		}
	}

	function showError(message: string): false {
		error = message;
		toasts.show('error', message);
		return false;
	}

	function validateStep(index: number): boolean {
		error = null;
		if (index === 0) {
			if (!activity.title.sv?.trim() || !activity.title.en?.trim())
				return showError(`${m.title_sv()}: ${m.required_fields()}`);
			if (!activity.description.sv?.trim() || !activity.description.en?.trim())
				return showError(`${m.description_sv()}: ${m.required_fields()}`);
			if (!activity.image_id) return showError(`${m.activity_image()}: ${m.required_fields()}`);
			if (!activity.creator_id) return showError(`${m.creator()}: ${m.required_fields()}`);
			if (!activity.responsible_name.trim() || !contactValue.trim())
				return showError(`${m.responsible_contact()}: ${m.required_fields()}`);
			if (new Date(activity.time_end) <= new Date(activity.time_start))
				return showError(m.end_after_start());
		}
		if (index === 1) {
			if ((north && !east) || (!north && east)) return showError(m.coordinates_together());
			if (north && (!Number.isFinite(Number(north)) || Math.abs(Number(north)) > 90))
				return showError(m.invalid_coordinates());
			if (east && (!Number.isFinite(Number(east)) || Math.abs(Number(east)) > 180))
				return showError(m.invalid_coordinates());
		}
		if (index === 2) {
			if (!hasTickets && visibilityGroupIds.length === 0)
				return showError(`${m.visibility_access()}: ${m.required_fields()}`);
			for (const ticket of hasTickets ? tickets : []) {
				if (!ticket.body.name.sv?.trim() || !ticket.body.name.en?.trim())
					return showError(`${m.ticket_name()}: ${m.required_fields()}`);
				if (ticket.preset === 'allocated' && ticket.body.allowed_group_ids.length !== 1)
					return showError(m.preset_requires_one_group());
				if (ticket.body.purchasing_available_stop <= ticket.body.purchasing_available_start)
					return showError(m.end_after_start());
			}
		}
		return true;
	}

	function next(): void {
		if (validateStep(step)) step = Math.min(steps.length - 1, step + 1);
	}

	function updateContactKind(value: string | number): void {
		contactKind = value === 'tel' ? 'tel' : 'mailto';
		activity.responsible_contact = `${contactKind}:${contactValue}`;
	}

	function updateContactValue(value: string): void {
		activity.responsible_contact = `${contactKind}:${value.trim()}`;
	}

	function updateStart(value: string): void {
		const duration = Math.max(
			3_600_000,
			new Date(activity.time_end).getTime() - new Date(activity.time_start).getTime()
		);
		activity.time_start = value;
		if (new Date(activity.time_end) <= new Date(value))
			activity.time_end = new Date(new Date(value).getTime() + duration).toISOString();
	}

	async function chooseImage(event: Event): Promise<void> {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		uploading = true;
		error = null;
		try {
			activity.image_id = await uploadImage(file);
			imageUrl = URL.createObjectURL(file);
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			uploading = false;
		}
	}

	function setPreset(index: number, value: string | number): void {
		const preset = String(value) as TicketPresetId;
		const draft = tickets[index];
		const shape = applyTicketPreset(draft.body, preset);
		draft.preset = preset;
		draft.body = { ...draft.body, ...shape };
		draft.dietary = ['free', 'simple', 'allocated'].includes(preset);
		if (draft.dietary && draft.body.addons.length === 0)
			draft.body.addons = [createDietaryPreferencesAddon()];
	}

	function toggleDietary(index: number, enabled: boolean): void {
		const draft = tickets[index];
		draft.dietary = enabled;
		draft.body.addons = setDietaryPreferencesAddon(draft.body.addons, enabled);
	}

	function addNotification(): void {
		notifications = [
			...notifications,
			{
				id: crypto.randomUUID(),
				target: '$all',
				kind: 'reminder',
				body: {
					title: { sv: '', en: '' },
					content: { sv: '', en: '' },
					send_at: new Date(Date.now() + 86_400_000).toISOString()
				}
			}
		];
	}

	async function submit(): Promise<void> {
		if (!validateStep(0) || !validateStep(1) || !validateStep(2)) return;
		if (
			notifications.some(
				(item) =>
					!item.kind.trim() ||
					!item.body.title.sv?.trim() ||
					!item.body.title.en?.trim() ||
					!item.body.content.sv?.trim() ||
					!item.body.content.en?.trim()
			)
		)
			return void showError(`${m.notification_kind()}: ${m.required_fields()}`);
		saving = true;
		error = null;
		try {
			await saveActivity(activityId, {
				...activity,
				location: {
					...activity.location,
					url: activity.location.url || undefined,
					coordinate_wgs84: north && east ? { north: Number(north), east: Number(east) } : undefined
				},
				host_ids: []
			});
			await Promise.all(organizerIds.map((groupId) => inviteActivityHost(activityId, groupId)));

			const createdTickets: TicketDraft[] = [];
			for (const groupId of visibilityGroupIds) {
				const visibility = newTicketDraft();
				visibility.id = crypto.randomUUID();
				visibility.preset = 'none';
				visibility.body = {
					...visibility.body,
					name: { sv: 'null', en: 'null' },
					max_tickets: 0,
					min_tickets: 0,
					allowed_group_ids: [groupId],
					addons: []
				};
				await saveTicketKind(visibility.id, visibility.body);
			}
			if (hasTickets) {
				for (const ticket of tickets) {
					await saveTicketKind(ticket.id, ticket.body);
					createdTickets.push(ticket);
				}
			}
			for (const notification of notifications) {
				const targets =
					notification.target === '$all'
						? createdTickets
						: createdTickets.filter((ticket) => ticket.id === notification.target);
				for (const target of targets)
					await saveNotification(target.id, notification.kind, notification.body);
			}
			await goto(resolve('/activities/[id]', { id: activityId }), { replaceState: true });
		} catch (cause) {
			error = frontendError(cause);
			toasts.show('error', `${m.wizard_partial_failure()} ${error}`);
		} finally {
			saving = false;
		}
	}
</script>

<header class="page-header edit-page-header">
	<div>
		<p class="eyebrow">{m.new_activity()}</p>
		<h1>{m.new_activity()}</h1>
	</div>
	<a class="button-link secondary" href={resolve('/')}><ArrowLeft size={18} /> {m.back()}</a>
</header>

<ActivityTabs
	labels={steps}
	active={step}
	furthest={step}
	accessibleLabel={m.new_activity()}
	onchange={(index) => (step = index)} />

{#if error}<p class="error-banner" role="alert">{error}</p>{/if}
{#if loading}<div class="loader"></div>{:else}
	<form onsubmit={(event) => event.preventDefault()}>
		{#if step === 0}
			<ActivityDetailsFields
				value={activity}
				{groups}
				{adminGroupIds}
				{contactKind}
				{contactValue}
				{imageUrl}
				{uploading}
				onchange={(value) => (activity = value)}
				onstartchange={updateStart}
				oncontactkindchange={updateContactKind}
				oncontactvaluechange={updateContactValue}
				onimagechange={(event) => void chooseImage(event)} />
		{:else if step === 1}
			<div class="stack">
				<ActivityLocationFields
					value={activity.location}
					{north}
					{east}
					onchange={(location) => (activity = { ...activity, location })}
					onnorthchange={(value) => (north = value)}
					oneastchange={(value) => (east = value)} />
				<section class="card card-pad stack">
					<div>
						<h2 class="section-title">{m.hosts()}</h2>
						<p class="muted">{m.organizers_after_creation()}</p>
					</div>
					<GroupTreePicker
						title={m.hosts()}
						groups={groups.filter((group) => group.id !== activity.creator_id)}
						selectedIds={organizerIds}
						onchange={(ids) => {
							organizerIds = ids;
						}} />
				</section>
			</div>
		{:else if step === 2}
			<section class="card card-pad stack">
				<div>
					<h2 class="section-title">{m.creation_step_tickets()}</h2>
					<p class="muted preserve-lines">{m.activities_details()}</p>
				</div>
				<label class="field"
					><span>{m.ticket_choice()}</span><Select
						value={hasTickets ? 'yes' : 'no'}
						options={[
							{ id: 'yes', label: m.ticket_choice_yes() },
							{ id: 'no', label: m.ticket_choice_none() }
						]}
						onchange={({ value }) => (hasTickets = value === 'yes')} /></label>
				<GroupTreePicker
					title={m.visibility_access()}
					{groups}
					selectedIds={visibilityGroupIds}
					inheritDescendants
					onchange={(ids) => {
						visibilityGroupIds = ids;
					}} />
				<p class="muted">{m.visibility_access_help()}</p>
				{#if hasTickets}
					<div class="toolbar between">
						<h2 class="section-title">{m.ticket_drafts()}</h2>
						<button
							class="button-link secondary"
							type="button"
							onclick={() => (tickets = [...tickets, newTicketDraft()])}
							><Plus size={16} /> {m.add_ticket_kind()}</button>
					</div>
					{#each tickets as ticket, index (ticket.id)}
						<details class="advanced-panel" open={index === 0}>
							<summary>{localize(ticket.body.name, '').trim() || m.empty_ticket_kind()}</summary>
							<div class="stack advanced-content">
								<div class="toolbar between">
									<Select
										value={ticket.preset}
										options={[
											{ id: 'free', label: m.preset_free() },
											{ id: 'simple', label: m.preset_simple() },
											{ id: 'allocated', label: m.preset_allocated() },
											{ id: 'advanced', label: m.preset_advanced() }
										]}
										onchange={({ value }) =>
											setPreset(index, value)} />{#if tickets.length > 1}<button
											class="icon-button danger-button"
											type="button"
											aria-label={m.delete()}
											onclick={() =>
												(tickets = tickets.filter((_, ticketIndex) => ticketIndex !== index))}
											><Trash2 size={17} /></button
										>{/if}
								</div>
								<TicketFields
									value={ticket.body}
									{groups}
									showPrice={ticket.preset !== 'free'}
									capacityLabel={ticket.preset === 'allocated' ? undefined : m.capacity()}
									singleGroup={ticket.preset === 'allocated'}
									onchange={(value) => (ticket.body = value)} />
								{#if ['free', 'simple', 'allocated'].includes(ticket.preset)}<label
										class="switch-field"
										><Switch
											value={hasDietaryPreferencesAddon(ticket.body.addons)}
											onchange={({ value }) => toggleDietary(index, value)} /><span
											>{m.include_dietary_preferences()}</span
										></label
									>{/if}
								{#if ticket.preset === 'advanced'}
									<AddonEditor
										addons={ticket.body.addons}
										onchange={(addons) => (ticket.body.addons = addons)} />
								{/if}
							</div>
						</details>
					{/each}
				{/if}
				<details class="advanced-panel">
					<summary>{m.advanced()}</summary>
					<div class="stack advanced-content">
						<label class="switch-field"
							><Switch
								value={limitCapacity}
								onchange={({ value }) => {
									limitCapacity = value;
									activity.max_tickets = value ? 1 : UNLIMITED_TICKETS;
								}} /><span>{m.limit_max_tickets()}</span></label
						>{#if limitCapacity}<label class="field"
								><span>{m.activity_capacity()}</span><input
									type="number"
									min="1"
									bind:value={activity.max_tickets} /></label
							>{/if}<label class="switch-field"
							><Switch
								value={activity.is_hidden_for_other_admins}
								onchange={({ value }) => (activity.is_hidden_for_other_admins = value)} /><span
								>{m.hide_other_admins()}</span
							></label>
					</div>
				</details>
			</section>
		{:else}
			<section class="card card-pad stack">
				<div>
					<h2 class="section-title">{m.scheduled_notifications()}</h2>
					<p class="muted">{m.default_release_notifications()}</p>
					<p class="muted">{m.notification_recipients_help()}</p>
				</div>
				{#each notifications as notification, index (notification.id)}
					<article class="nested-card stack">
						<div class="toolbar between">
							<strong>{notification.kind || m.notification()}</strong><button
								class="icon-button danger-button"
								type="button"
								aria-label={m.remove_notification()}
								onclick={() =>
									(notifications = notifications.filter(
										(_, notificationIndex) => notificationIndex !== index
									))}><Trash2 size={17} /></button>
						</div>
						<div class="grid-2">
							<label class="field"
								><span>{m.notification_target()}</span><Select
									value={notification.target}
									options={[
										{ id: '$all', label: m.all_ticket_kinds() },
										...tickets.map((ticket) => ({
											id: ticket.id,
											label: localize(ticket.body.name, '').trim() || m.empty_ticket_kind()
										}))
									]}
									onchange={({ value }) => (notification.target = String(value))} /></label>
						</div>
						<NotificationFields
							kind={notification.kind}
							value={notification.body}
							onkindchange={(kind) => (notification.kind = kind)}
							onchange={(value) => (notification.body = value)} />
					</article>
				{/each}
				{#if hasTickets}<button
						class="button-link secondary"
						type="button"
						onclick={addNotification}><Plus size={16} /> {m.add_notification()}</button
					>{/if}
			</section>
		{/if}

		<div class="wizard-actions">
			{#if step > 0}<button class="button-link secondary" type="button" onclick={() => (step -= 1)}
					>{m.back()}</button
				>{/if}
			{#if step < steps.length - 1}<button class="button-link" type="button" onclick={next}
					>{m.continue()}</button
				>{:else}<button
					class="button-link"
					type="button"
					disabled={saving}
					onclick={() => void submit()}>{saving ? m.saving() : m.create_activity()}</button
				>{/if}
		</div>
	</form>
{/if}
