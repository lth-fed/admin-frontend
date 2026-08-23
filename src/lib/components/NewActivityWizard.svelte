<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { activityTabIndex, activityTabUrl, isActivityTabNavigation } from '$lib/activity-tabs';
	import {
		getMe,
		inviteActivityHost,
		listGroupTree,
		saveActivity,
		saveNotification,
		saveTicketKind
	} from '$lib/api/admin';
	import { frontendError } from '$lib/api/client';
	import type { Group, PutActivity, PutNotification, PutTicketKind } from '$lib/api/types';
	import {
		defaultActivityVisibility,
		defaultTicketRelease,
		ticketReleaseIsTooSoon
	} from '$lib/activity-form';
	import AddonEditor from '$lib/components/AddonEditor.svelte';
	import ActivityDetailsFields from '$lib/components/ActivityDetailsFields.svelte';
	import ActivityLocationFields from '$lib/components/ActivityLocationFields.svelte';
	import ActivityTabs from '$lib/components/ActivityTabs.svelte';
	import DateTimePicker from '$lib/components/DateTimePicker.svelte';
	import GroupTreePicker from '$lib/components/GroupTreePicker.svelte';
	import NotificationFields from '$lib/components/NotificationFields.svelte';
	import TicketFields from '$lib/components/TicketFields.svelte';
	import { localize } from '$lib/i18n';
	import { uploadImage, uploadRandomColorImage } from '$lib/image';
	import * as m from '$lib/paraglide/messages';
	import {
		applyTicketPreset,
		createDietaryPreferencesAddon,
		hasDietaryPreferencesAddon,
		setDietaryPreferencesAddon,
		ticketAddonDataKey,
		type TicketPresetId,
		UNLIMITED_TICKETS
	} from '$lib/ticket-presets';
	import { toasts } from '$lib/toasts.svelte';
	import { applySharedAddonChanges, sharedTicketAddons } from '$lib/shared-addons';
	import { ArrowLeft, Plus, Trash2 } from '@lucide/svelte';
	import { Select, Switch } from '@svar-ui/svelte-core';
	import { parseCoordinate } from '$lib/coordinates';

	type TicketDraft = {
		id: string;
		preset: TicketPresetId;
		dietary: boolean;
		invited: boolean;
		paidPrice: number;
		transfersEnabled: boolean;
		overriddenAddonIds: string[];
		body: PutTicketKind;
	};
	type NotificationDraft = {
		id: string;
		target: string;
		kind: string;
		body: PutNotification;
	};

	function initialActivityTimes(): { start: string; end: string } {
		const fallbackStart = new Date(Date.now() + 86_400_000);
		const requestedStart = new Date(page.url.searchParams.get('start') ?? fallbackStart);
		const start = Number.isNaN(requestedStart.getTime()) ? fallbackStart : requestedStart;
		const fallbackEnd = new Date(start.getTime() + 3_600_000);
		const requestedEnd = new Date(page.url.searchParams.get('end') ?? fallbackEnd);
		const end =
			Number.isNaN(requestedEnd.getTime()) || requestedEnd <= start ? fallbackEnd : requestedEnd;
		return { start: start.toISOString(), end: end.toISOString() };
	}

	const initialTimes = initialActivityTimes();

	const activityId = crypto.randomUUID();
	const steps = [
		m.creation_step_details(),
		m.creation_step_logistics(),
		m.creation_step_tickets(),
		m.creation_step_notifications()
	];
	let step = $derived(activityTabIndex(page.url));
	let loading = $state(true);
	let saving = $state(false);
	let uploading = $state(false);
	let error = $state<string | null>(null);
	let invalidField = $state<string | null>(null);
	let invalidTicketId = $state<string | null>(null);
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
	let notifications = $state<NotificationDraft[]>([]);
	let savedWizardSnapshot = $state('');
	let allowNavigation = $state(false);
	let activity = $state<PutActivity>({
		responsible_name: '',
		responsible_contact: '',
		creator_id: '',
		title: { sv: '', en: '' },
		description: { sv: '', en: '' },
		location: { name: { sv: '', en: '' }, directions: { sv: '', en: '' }, url: '' },
		time_start: initialTimes.start,
		time_end: initialTimes.end,
		image_id: '',
		is_hidden: true,
		is_hidden_for_other_admins: false,
		max_tickets: UNLIMITED_TICKETS,
		host_ids: []
	});
	let tickets = $state<TicketDraft[]>([newTicketDraft()]);
	let openTicketEditors = $state<Record<string, boolean>>({});
	const contactValue = $derived(activity.responsible_contact.replace(/^(mailto:|tel:)/, ''));
	const wizardDirty = $derived(
		savedWizardSnapshot !== '' && serializeWizard() !== savedWizardSnapshot
	);

	beforeNavigate(({ cancel, from, to, willUnload }) => {
		if (!wizardDirty || allowNavigation) return;
		if (isActivityTabNavigation(from?.url ?? null, to?.url ?? null)) return;
		if (willUnload) {
			cancel();
			return;
		}
		if (!confirm(m.unsaved_changes())) cancel();
	});

	$effect(() => {
		void load();
	});

	function changeStep(index: number): void {
		if (index === step) return;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- helper keeps the current resolved route and changes only its tab query
		void goto(activityTabUrl(page.url, index), { keepFocus: true, noScroll: true });
	}

	function newTicketDraft(existingAddons: PutTicketKind['addons'] = []): TicketDraft {
		const id = crypto.randomUUID();
		const release = defaultTicketRelease();
		return {
			id,
			preset: 'simple',
			dietary: true,
			invited: false,
			paidPrice: 0,
			transfersEnabled: true,
			overriddenAddonIds: [],
			body: {
				activity_id: activityId,
				name: { sv: '', en: '' },
				price: 0,
				purchasing_available_start: release,
				purchasing_available_stop: new Date(Date.now() + 86_400_000).toISOString(),
				max_tickets: 1,
				min_tickets: 0,
				allow_transfer_ticket_start: release,
				allow_transfer_ticket_stop: activity.time_start,
				allow_transfer_ticket_bypass_allowed_groups: false,
				allowed_group_ids: [],
				addons: [createDietaryPreferencesAddon(existingAddons)]
			}
		};
	}

	function serializeWizard(): string {
		return JSON.stringify({
			activity,
			north,
			east,
			organizerIds,
			visibilityGroupIds,
			hasTickets,
			limitCapacity,
			tickets,
			notifications
		});
	}

	async function load(): Promise<void> {
		try {
			const [me, tree] = await Promise.all([getMe(), listGroupTree()]);
			groups = tree;
			adminGroupIds = me.admin_group_ids;
			activity.creator_id = me.admin_group_ids[0] ?? '';
			visibilityGroupIds = defaultActivityVisibility(tree, activity.creator_id);
			activity.responsible_name = me.name;
			if (me.id.startsWith('email:')) activity.responsible_contact = `mailto:${me.id.slice(6)}`;
			savedWizardSnapshot = serializeWizard();
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			loading = false;
		}
	}

	function showError(
		message: string,
		field: string | null = null,
		ticketId: string | null = null
	): false {
		error = message;
		invalidField = field;
		invalidTicketId = ticketId;
		toasts.show('error', message);
		return false;
	}

	function validateStep(index: number): boolean {
		error = null;
		invalidField = null;
		invalidTicketId = null;
		if (index === 0) {
			if (!activity.creator_id)
				return showError(`${m.creator()}: ${m.required_fields()}`, m.creator());
			if (new Date(activity.time_end) <= new Date(activity.time_start))
				return showError(m.end_after_start(), m.end());
		}
		if (index === 1) {
			if ((north && !east) || (!north && east))
				return showError(m.coordinates_together(), `${m.latitude()} / ${m.longitude()}`);
			if (north && parseCoordinate(north, 'north') === null)
				return showError(m.invalid_coordinates(), m.latitude());
			if (east && parseCoordinate(east, 'east') === null)
				return showError(m.invalid_coordinates(), m.longitude());
		}
		if (index === 2) {
			if (!hasTickets && visibilityGroupIds.length === 0)
				return showError(`${m.visibility_access()}: ${m.required_fields()}`);
			for (const ticket of hasTickets ? tickets : []) {
				if (!ticket.body.name.sv?.trim() || !ticket.body.name.en?.trim())
					return showError(
						`${m.ticket_name()}: ${m.required_fields()}`,
						m.ticket_name(),
						ticket.id
					);
				if (ticket.preset === 'allocated' && ticket.body.allowed_group_ids.length === 0)
					return showError(`${m.allowed_groups()}: ${m.required_fields()}`);
				if (ticket.body.purchasing_available_stop <= ticket.body.purchasing_available_start)
					return showError(m.end_after_start(), m.available_until(), ticket.id);
				if (ticketReleaseIsTooSoon(ticket.body.purchasing_available_start))
					return showError(m.ticket_release_too_soon(), m.available_from(), ticket.id);
				if (
					ticket.transfersEnabled &&
					ticket.body.allow_transfer_ticket_stop <= ticket.body.allow_transfer_ticket_start
				)
					return showError(m.ticket_dates_order(), m.transfer_until(), ticket.id);
			}
		}
		return true;
	}

	function next(): void {
		if (validateStep(step)) changeStep(Math.min(steps.length - 1, step + 1));
	}

	function updateContactKind(value: string | number): void {
		contactKind = value === 'tel' ? 'tel' : 'mailto';
		activity.responsible_contact = `${contactKind}:${contactValue}`;
	}

	function updateContactValue(value: string): void {
		activity.responsible_contact = `${contactKind}:${value.trim()}`;
	}

	function updateActivity(value: PutActivity): void {
		if (value.creator_id !== activity.creator_id)
			visibilityGroupIds = defaultActivityVisibility(groups, value.creator_id);
		activity = value;
	}

	function updateStart(value: string): void {
		const previousStart = activity.time_start;
		const duration = Math.max(
			3_600_000,
			new Date(activity.time_end).getTime() - new Date(activity.time_start).getTime()
		);
		activity.time_start = value;
		for (const ticket of tickets) {
			if (ticket.body.allow_transfer_ticket_stop === previousStart)
				ticket.body.allow_transfer_ticket_stop = value;
		}
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
		if (preset === 'allocated') {
			draft.paidPrice = draft.body.price;
			draft.invited = draft.body.price === 0;
		}
		draft.dietary = ['free', 'simple', 'allocated'].includes(preset);
		if (draft.dietary && draft.body.addons.length === 0)
			draft.body.addons = [createDietaryPreferencesAddon(reusableAddonsFor(index))];
	}

	function updateTicket(index: number, value: PutTicketKind): void {
		const draft = tickets[index];
		if (draft.body.allow_transfer_ticket_start === draft.body.purchasing_available_start)
			value.allow_transfer_ticket_start = value.purchasing_available_start;
		draft.body = value;
	}

	function toggleInvited(index: number, invited: boolean): void {
		const draft = tickets[index];
		draft.invited = invited;
		if (invited) {
			draft.paidPrice = draft.body.price;
			draft.body.price = 0;
		} else {
			draft.body.price = Math.max(draft.paidPrice, 1);
		}
	}

	function toggleTransfers(index: number, enabled: boolean): void {
		const draft = tickets[index];
		draft.transfersEnabled = enabled;
		if (enabled) {
			draft.body.allow_transfer_ticket_start = draft.body.purchasing_available_start;
			draft.body.allow_transfer_ticket_stop = activity.time_start;
		}
	}

	function toggleDietary(index: number, enabled: boolean): void {
		const draft = tickets[index];
		draft.dietary = enabled;
		draft.body.addons = setDietaryPreferencesAddon(
			draft.body.addons,
			enabled,
			reusableAddonsFor(index)
		);
	}

	function reusableAddonsFor(ticketIndex: number): PutTicketKind['addons'] {
		return tickets
			.filter((_, index) => index !== ticketIndex)
			.flatMap((ticket) => ticket.body.addons);
	}

	function lockedAddonIdsFor(ticketIndex: number): string[] {
		const ticket = tickets[ticketIndex];
		const reusable = reusableAddonsFor(ticketIndex);
		return ticket.body.addons
			.filter(
				(addon) =>
					!ticket.overriddenAddonIds.includes(addon.id) &&
					reusable.some((candidate) => ticketAddonDataKey(candidate) === ticketAddonDataKey(addon))
			)
			.map((addon) => addon.id);
	}

	function overrideSharedAddon(ticketIndex: number, addonId: string): void {
		if (!confirm(m.override_shared_addon_confirm())) return;
		const ticket = tickets[ticketIndex];
		ticket.overriddenAddonIds = [...ticket.overriddenAddonIds, addonId];
	}

	function updateSharedAddons(next: PutTicketKind['addons']): void {
		const addonLists = $state.snapshot(tickets.map((ticket) => ticket.body.addons));
		const previous = sharedTicketAddons(addonLists);
		const updated = applySharedAddonChanges(addonLists, previous, $state.snapshot(next));
		tickets = tickets.map((ticket, index) => ({
			...ticket,
			body: { ...ticket.body, addons: updated[index] }
		}));
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
		for (let index = 0; index <= 2; index += 1) {
			if (validateStep(index)) continue;
			changeStep(index);
			return;
		}
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
			if (!activity.image_id) activity.image_id = await uploadRandomColorImage();
			const parsedNorth = parseCoordinate(north, 'north');
			const parsedEast = parseCoordinate(east, 'east');
			await saveActivity(activityId, {
				...activity,
				location: {
					...activity.location,
					url: activity.location.url || undefined,
					coordinate_wgs84:
						typeof parsedNorth === 'number' && typeof parsedEast === 'number'
							? { north: parsedNorth, east: parsedEast }
							: undefined
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
					await saveTicketKind(ticket.id, {
						...ticket.body,
						allow_transfer_ticket_stop: ticket.transfersEnabled
							? ticket.body.allow_transfer_ticket_stop
							: ticket.body.allow_transfer_ticket_start
					});
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
			allowNavigation = true;
			await goto(resolve('/activities/[id]', { id: activityId }), { replaceState: true });
		} catch (cause) {
			allowNavigation = false;
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
	interactive={false}
	accessibleLabel={m.new_activity()}
	onchange={changeStep} />

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
				{invalidField}
				onchange={updateActivity}
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
					{invalidField}
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
					<AddonEditor
						addons={sharedTicketAddons(
							$state.snapshot(tickets.map((ticket) => ticket.body.addons))
						)}
						allowCreate={false}
						allowDuplicate={false}
						help={m.shared_addons_panel_help()}
						onchange={updateSharedAddons} />
					<div class="toolbar between">
						<h2 class="section-title">{m.ticket_drafts()}</h2>
						<button
							class="button-link secondary"
							type="button"
							onclick={() =>
								(tickets = [
									...tickets,
									newTicketDraft(tickets.flatMap((ticket) => ticket.body.addons))
								])}><Plus size={16} /> {m.add_ticket_kind()}</button>
					</div>
					{#each tickets as ticket, index (ticket.id)}
						<details
							class="advanced-panel"
							ontoggle={(event) => (openTicketEditors[ticket.id] = event.newState === 'open')}
							open={openTicketEditors[ticket.id] ?? index === 0}>
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
									invalidField={invalidTicketId === ticket.id ? invalidField : null}
									showPrice={ticket.preset !== 'free' &&
										!(ticket.preset === 'allocated' && ticket.invited)}
									showInvitedToggle={ticket.preset === 'allocated'}
									invited={ticket.invited}
									capacityLabel={ticket.preset === 'allocated' ? undefined : m.capacity()}
									oninvitedchange={(invited) => toggleInvited(index, invited)}
									onchange={(value) => updateTicket(index, value)} />
								<div class="stack transfer-settings">
									<label class="switch-field">
										<Switch
											value={ticket.transfersEnabled}
											onchange={({ value }) => toggleTransfers(index, value)} />
										<span>{m.allow_transfers()}</span>
									</label>
									{#if ticket.transfersEnabled}
										<div class="date-range">
											<DateTimePicker
												label={m.transfer_from()}
												value={ticket.body.allow_transfer_ticket_start}
												onchange={(value) => (ticket.body.allow_transfer_ticket_start = value)} />
											<DateTimePicker
												label={m.transfer_until()}
												value={ticket.body.allow_transfer_ticket_stop}
												error={ticket.body.allow_transfer_ticket_stop <=
													ticket.body.allow_transfer_ticket_start}
												onchange={(value) => (ticket.body.allow_transfer_ticket_stop = value)} />
										</div>
										<label class="switch-field">
											<Switch
												value={ticket.body.allow_transfer_ticket_bypass_allowed_groups}
												onchange={({ value }) =>
													(ticket.body.allow_transfer_ticket_bypass_allowed_groups = value)} />
											<span>{m.transfer_bypass()}</span>
										</label>
									{/if}
								</div>
								{#if ['free', 'simple', 'allocated'].includes(ticket.preset)}<label
										class="switch-field"
										><Switch
											value={hasDietaryPreferencesAddon(ticket.body.addons)}
											onchange={({ value }) => toggleDietary(index, value)} /><span
											>{m.include_dietary_preferences()}</span
										></label
									>{/if}
								{#if ['simple', 'allocated', 'advanced'].includes(ticket.preset)}
									<AddonEditor
										addons={ticket.body.addons}
										reusableAddons={reusableAddonsFor(index)}
										lockedAddonIds={lockedAddonIdsFor(index)}
										onoverride={(addonId) => overrideSharedAddon(index, addonId)}
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
			{#if step > 0}<button
					class="button-link secondary"
					type="button"
					onclick={() => changeStep(step - 1)}>{m.back()}</button
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
