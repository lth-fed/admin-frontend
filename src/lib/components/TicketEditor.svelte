<script lang="ts">
	import { beforeNavigate, goto, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		deleteTicketKind,
		getActivity,
		getTicketKind,
		getActivityTicketKinds,
		listActivityAddons,
		saveActivityAddon,
		listGroupTree,
		saveTicketKind
	} from '$lib/api/admin';
	import { ApiError, frontendError } from '$lib/api/client';
	import { defaultTicketRelease, ticketReleaseIsTooSoon } from '$lib/activity-form';
	import type { Group, PutTicketKind, TicketKind } from '$lib/api/types';
	import DateTimePicker from '$lib/components/DateTimePicker.svelte';
	import GroupTreePicker from '$lib/components/GroupTreePicker.svelte';
	import TicketFields from '$lib/components/TicketFields.svelte';
	import { copiedLocalizedTitle, localize, sortByLocalizedName } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import {
		applyTicketPreset,
		hasDietaryPreferencesAddon,
		setDietaryPreferencesAddon,
		detectTicketPreset,
		type TicketPresetId,
		UNLIMITED_TICKETS
	} from '$lib/ticket-presets';
	import { ticketKindBody } from '$lib/ticket-kind';
	import { toasts } from '$lib/toasts.svelte';
	import {
		TRANSFER_START,
		TRANSFER_STOP,
		hasTransferWindow,
		defaultTransferGroups,
		sameGroups
	} from '$lib/transfer-settings';
	import { ArrowLeft, Copy, Trash2 } from '@lucide/svelte';
	import { Select, Switch } from '@svar-ui/svelte-core';
	import { onMount, untrack } from 'svelte';

	const I32_MAX = UNLIMITED_TICKETS;
	type ValidationIssue = { field: string; message: string };
	type DuplicateTicketNavigationState = { duplicatedTicket?: PutTicketKind };

	let { id, activityId }: { id: string | null; activityId: string } = $props();
	let loading = $state(true);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let invalidField = $state<string | null>(null);
	let groups = $state<Group[]>([]);
	let reusableAddons = $state<PutTicketKind['addons']>([]);
	const optionalAddons = $derived(
		sortByLocalizedName(
			reusableAddons.filter((addon) => !hasDietaryPreferencesAddon([addon])),
			(addon) => addon.name
		)
	);
	let originalTicket = $state<Awaited<ReturnType<typeof getTicketKind>> | null>(null);
	let transfersEnabled = $state(true);
	let otherTicketKinds = $state<TicketKind[]>([]);
	let customizingTransfers = $state(false);
	let preset = $state<TicketPresetId>('simple');
	let allocatedFree = $state(false);
	let allocatedPaidPrice = $state(0);
	let activityStart = $state('');
	let form = $state<PutTicketKind>({
		activity_id: '',
		name: { sv: '', en: '' },
		price: 0,
		purchasing_available_start: defaultTicketRelease(),
		purchasing_available_stop: new Date(Date.now() + 86_400_000).toISOString(),
		max_tickets: 100,
		for_visibility: false,
		min_tickets: 0,
		allow_transfer_ticket_start: new Date().toISOString(),
		allow_transfer_ticket_stop: new Date(Date.now() + 31_536_000_000).toISOString(),
		transfer_group_ids: [],
		allowed_group_ids: [],
		addons: []
	});
	let savedTicketSnapshot = $state('');
	const limitMaximum = $derived(form.max_tickets !== I32_MAX);
	const defaultGroupIds = $derived(defaultTransferGroups(form, [...otherTicketKinds, form]));
	const transferGroupsDefault = $derived(sameGroups(form.transfer_group_ids, defaultGroupIds));
	const limitedTransferWindow = $derived(
		hasTransferWindow(form.allow_transfer_ticket_start, form.allow_transfer_ticket_stop)
	);
	let allowNavigation = $state(false);
	let now = $state(Date.now());
	const ticketDirty = $derived(
		savedTicketSnapshot !== '' && serializeTicketEditor() !== savedTicketSnapshot
	);
	const hasUnsavedChanges = $derived(ticketDirty);
	const purchasedFieldsLocked = $derived(Boolean(originalTicket?.has_been_purchased));
	const canDelete = $derived(
		Boolean(
			originalTicket &&
			!originalTicket.has_been_purchased &&
			!originalTicket.has_been_released &&
			new Date(originalTicket.purchasing_available_start).getTime() > now + 20 * 60_000
		)
	);

	onMount(() => {
		const timer = window.setInterval(() => (now = Date.now()), 30_000);
		return () => window.clearInterval(timer);
	});

	beforeNavigate(({ cancel, willUnload }) => {
		if (!hasUnsavedChanges || allowNavigation) return;
		if (willUnload) {
			cancel();
			return;
		}
		if (!confirm(m.unsaved_changes())) cancel();
	});

	$effect(() => {
		// Reload only when the editor's identity changes, not when form fields change.
		const identity = { id, activityId };
		untrack(() => void load(identity.id, identity.activityId));
	});

	async function load(id: string | null, activityId: string): Promise<void> {
		loading = true;
		error = null;
		try {
			if (!id) {
				const [groupTree, activity, kinds] = await Promise.all([
					listGroupTree(),
					getActivity(activityId),
					getActivityTicketKinds(activityId)
				]);
				otherTicketKinds = kinds;
				reusableAddons = await listActivityAddons(activityId);
				form.allow_transfer_ticket_start = TRANSFER_START;
				form.allow_transfer_ticket_stop = TRANSFER_STOP;
				form.transfer_group_ids = defaultTransferGroups(form, [...kinds, form]);
				groups = groupTree;
				activityStart = activity.time_start;
				form.activity_id = activityId;
				savedTicketSnapshot = serializeTicketEditor();
				return;
			}
			const [ticket, groupTree] = await Promise.all([getTicketKind(id), listGroupTree()]);
			originalTicket = ticket;
			const [activity, kinds] = await Promise.all([
				getActivity(ticket.activity_id),
				getActivityTicketKinds(ticket.activity_id)
			]);
			activityStart = activity.time_start;
			reusableAddons = await listActivityAddons(ticket.activity_id);
			otherTicketKinds = kinds.filter((kind) => kind.ticket_kind_id !== ticket.ticket_kind_id);
			preset = detectTicketPreset(ticket);
			allocatedFree = preset === 'allocated' && ticket.price === 0;
			allocatedPaidPrice = ticket.price;
			const loadedForm = structuredClone(ticketKindBody(ticket));
			const duplicatedTicket = (page.state as DuplicateTicketNavigationState).duplicatedTicket;
			form =
				duplicatedTicket?.activity_id === ticket.activity_id
					? structuredClone($state.snapshot(duplicatedTicket))
					: loadedForm;
			if (duplicatedTicket) replaceState(resolve('/tickets/[id]', { id }), {});
			groups = groupTree;
			transfersEnabled =
				new Date(ticket.allow_transfer_ticket_stop) > new Date(ticket.allow_transfer_ticket_start);
			savedTicketSnapshot = serializeTicketEditor();
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			loading = false;
		}
	}

	function serializeTicketEditor(): string {
		return JSON.stringify({ form, transfersEnabled, preset, allocatedFree });
	}

	function immutableTicketFieldsMatch(
		body: PutTicketKind,
		addons: PutTicketKind['addons']
	): boolean {
		if (!originalTicket?.has_been_purchased) return true;
		if (
			body.price !== originalTicket.price ||
			!sameGroups(body.allowed_group_ids, originalTicket.allowed_group_ids) ||
			addons.length !== originalTicket.available_addons.length
		)
			return false;
		return sameGroups(
			addons.map((addon) => addon.id),
			originalTicket.available_addons.map((addon) => addon.id)
		);
	}

	function validate(body: PutTicketKind, addons: PutTicketKind['addons']): ValidationIssue | null {
		if (preset !== 'none' && !body.name.sv.trim())
			return { field: m.name_sv(), message: m.required_fields() };
		if (preset !== 'none' && !body.name.en.trim())
			return { field: m.name_en(), message: m.required_fields() };
		if (!Number.isSafeInteger(body.price) || body.price < 0)
			return { field: m.price(), message: m.money_input_invalid() };
		if (
			![body.min_tickets, body.max_tickets].every(
				(value) => Number.isInteger(value) && value >= 0
			) ||
			!((body.min_tickets === 0 && body.max_tickets === 0) || body.min_tickets < body.max_tickets)
		)
			return { field: m.maximum_tickets(), message: m.ticket_limits_invalid() };
		if (body.max_tickets < (originalTicket?.reserved_or_purchased_tickets ?? 0))
			return {
				field: m.maximum_tickets(),
				message: m.capacity_too_low({ minimum: originalTicket?.reserved_or_purchased_tickets ?? 0 })
			};
		if (
			(preset !== 'none' &&
				new Date(body.purchasing_available_stop) <= new Date(body.purchasing_available_start)) ||
			(transfersEnabled &&
				new Date(body.allow_transfer_ticket_stop) <= new Date(body.allow_transfer_ticket_start))
		)
			return {
				field: `${m.available_until()} / ${m.transfer_until()}`,
				message: m.ticket_dates_order()
			};
		if (
			preset !== 'none' &&
			(!originalTicket ||
				body.purchasing_available_start !== originalTicket.purchasing_available_start) &&
			ticketReleaseIsTooSoon(body.purchasing_available_start)
		)
			return { field: m.available_from(), message: m.ticket_release_too_soon() };
		const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
		if (body.allowed_group_ids.length === 0)
			return { field: m.allowed_groups(), message: m.required_fields() };
		if (!body.allowed_group_ids.every((groupId) => uuid.test(groupId)))
			return { field: m.allowed_groups(), message: m.invalid_group_ids() };
		if (
			transfersEnabled &&
			(body.transfer_group_ids.length === 0 ||
				!body.transfer_group_ids.every((groupId) => uuid.test(groupId)))
		)
			return { field: m.transfer_groups(), message: m.required_fields() };
		if (preset === 'none' && body.allowed_group_ids.length !== 1)
			return { field: m.allowed_groups(), message: m.preset_requires_one_group() };
		if (!addons.every((addon) => uuid.test(addon.id)))
			return { field: m.addons(), message: m.ticket_addons_invalid() };
		return null;
	}

	function immutableEditRejected(cause: unknown): boolean {
		return (
			cause instanceof ApiError &&
			cause.status === 400 &&
			(cause.message.includes('immutable') ||
				cause.message.includes('purchased while') ||
				cause.message.includes('cannot change release date'))
		);
	}

	async function replacePurchasedTicket(body: PutTicketKind): Promise<void> {
		if (!id || !originalTicket) return;
		const now = new Date().toISOString();
		const originalBody = ticketKindBody($state.snapshot(originalTicket));
		await saveTicketKind(id, { ...originalBody, purchasing_available_stop: now });

		const replacementId = crypto.randomUUID();
		try {
			await saveTicketKind(replacementId, {
				...body,
				name: { sv: `${body.name.sv} v2`, en: `${body.name.en} v2` }
			});
		} catch (cause) {
			// These are separate HTTP requests. Restore the old sales window if creating v2 fails.
			await saveTicketKind(id, originalBody);
			throw cause;
		}
		allowNavigation = true;
		await goto(resolve('/tickets/[id]', { id: replacementId }), { replaceState: true });
	}

	function showValidation(field: string, message: string): void {
		invalidField = field;
		error = `${field}: ${message}`;
		toasts.show('error', error);
	}

	function toggleMaximum(enabled: boolean): void {
		form.max_tickets = enabled
			? Math.max(form.min_tickets + 1, originalTicket?.reserved_or_purchased_tickets ?? 0, 1)
			: I32_MAX;
	}

	function toggleTransfers(enabled: boolean): void {
		transfersEnabled = enabled;
		if (enabled) {
			form.allow_transfer_ticket_start = TRANSFER_START;
			form.allow_transfer_ticket_stop = TRANSFER_STOP;
		}
	}

	function toggleTransferWindow(limited: boolean): void {
		form.allow_transfer_ticket_start = limited ? form.purchasing_available_start : TRANSFER_START;
		form.allow_transfer_ticket_stop = limited ? activityStart : TRANSFER_STOP;
	}

	function updateTicketForm(value: PutTicketKind): void {
		if (transferGroupsDefault) {
			value.transfer_group_ids = defaultTransferGroups(value, [...otherTicketKinds, value]);
		}
		if (form.allow_transfer_ticket_start === form.purchasing_available_start)
			value.allow_transfer_ticket_start = value.purchasing_available_start;
		form = value;
	}

	function changePreset(next: string | number): void {
		const selected = String(next) as TicketPresetId;
		if (selected === preset || purchasedFieldsLocked) return;
		const previousPreset = preset;
		preset = selected;
		updateTicketForm({
			...form,
			...applyTicketPreset(form, selected),
			transfer_group_ids: [...form.transfer_group_ids]
		});
		if (previousPreset === 'none' && selected !== 'none') toggleTransfers(true);
		if (selected === 'allocated') {
			allocatedPaidPrice = form.price;
			allocatedFree = form.price === 0;
		}
	}

	function toggleAllocatedFree(enabled: boolean): void {
		allocatedFree = enabled;
		if (enabled) {
			allocatedPaidPrice = form.price;
			form.price = 0;
		} else {
			form.price = Math.max(allocatedPaidPrice, 1);
		}
	}

	async function saveNewAddons(addons: PutTicketKind['addons']): Promise<void> {
		for (const addon of addons) {
			if (
				reusableAddons.some((existing) => existing.id === addon.id) ||
				originalTicket?.available_addons.some((existing) => existing.id === addon.id)
			)
				continue;
			await saveActivityAddon(form.activity_id, addon);
			reusableAddons = [...reusableAddons, addon];
		}
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		saving = true;
		error = null;
		invalidField = null;
		const addons = $state.snapshot(form.addons);
		const body: PutTicketKind = {
			...form,
			name: preset === 'none' ? { sv: '', en: '' } : form.name,
			allow_transfer_ticket_stop: transfersEnabled
				? form.allow_transfer_ticket_stop
				: form.allow_transfer_ticket_start,
			addons
		};
		try {
			const validationIssue = validate(body, addons);
			if (validationIssue) {
				showValidation(validationIssue.field, validationIssue.message);
				return;
			}
			const ticketId = id ?? crypto.randomUUID();
			await saveNewAddons(addons);
			form = await saveTicketKind(ticketId, body);
			savedTicketSnapshot = serializeTicketEditor();
			if (!id) {
				allowNavigation = true;
				await goto(resolve('/tickets/[id]', { id: ticketId }), { replaceState: true });
			}
		} catch (cause) {
			if (
				id &&
				originalTicket?.has_been_purchased &&
				(!immutableTicketFieldsMatch(body, addons) ||
					body.purchasing_available_start !== originalTicket.purchasing_available_start) &&
				immutableEditRejected(cause) &&
				confirm(m.replace_ticket_confirm())
			) {
				try {
					await replacePurchasedTicket(body);
					return;
				} catch (replacementCause) {
					allowNavigation = false;
					error = frontendError(replacementCause);
					return;
				}
			}
			error = frontendError(cause);
		} finally {
			saving = false;
		}
	}

	async function duplicateTicketKind(): Promise<void> {
		if (!id) return;
		saving = true;
		error = null;
		try {
			const ticketId = crypto.randomUUID();
			const copy = $state.snapshot(form);
			const frontendCopy: PutTicketKind = {
				...copy,
				name: copiedLocalizedTitle(copy.name)
			};
			const futureStart = new Date(Date.now() + 100 * 365 * 86_400_000);
			const futureStop = new Date(futureStart.getTime() + 365 * 86_400_000);
			await saveNewAddons(frontendCopy.addons);
			await saveTicketKind(ticketId, {
				...frontendCopy,
				purchasing_available_start: futureStart.toISOString(),
				purchasing_available_stop: futureStop.toISOString()
			});
			allowNavigation = true;
			await goto(resolve('/tickets/[id]', { id: ticketId }), {
				state: { duplicatedTicket: frontendCopy } satisfies DuplicateTicketNavigationState
			});
		} catch (cause) {
			allowNavigation = false;
			error = frontendError(cause);
		} finally {
			saving = false;
		}
	}

	async function removeTicketKind(): Promise<void> {
		if (!id || !canDelete || !confirm(m.delete_ticket_kind_confirm())) return;
		saving = true;
		error = null;
		try {
			await deleteTicketKind(id);
			allowNavigation = true;
			await goto(resolve('/activities/[id]?tab=tickets', { id: form.activity_id }), {
				replaceState: true
			});
		} catch (cause) {
			allowNavigation = false;
			error = frontendError(cause);
		} finally {
			saving = false;
		}
	}
</script>

<header class="page-header edit-page-header">
	<div>
		<p class="eyebrow">{m.tickets()}</p>
		<h1>
			{m.ticket_kind()} · {localize(form.name, '').trim() || m.empty_ticket_kind()}
		</h1>
	</div>
	<div class="toolbar">
		{#if id}
			<button
				class="button-link secondary"
				type="button"
				disabled={saving}
				onclick={() => void duplicateTicketKind()}>
				<Copy size={17} />
				{m.duplicate_ticket_kind()}
			</button>
		{/if}
		<a
			class="button-link secondary"
			href={form.activity_id
				? resolve('/activities/[id]?tab=tickets', { id: form.activity_id })
				: resolve('/')}><ArrowLeft size={18} /> {m.back()}</a>
	</div>
</header>

{#if loading}
	<div class="center-stage">
		<div class="loader"></div>
		<p>{m.loading()}</p>
	</div>
{:else}
	<form class="stack" novalidate onsubmit={submit}>
		{#if error}<p class="error-banner" role="alert">{error}</p>{/if}
		{#if purchasedFieldsLocked}<p class="info-banner" role="status">
				{m.purchased_ticket_edit_limits()}
			</p>{/if}
		<section class="card card-pad">
			<div class="field preset-field" inert={purchasedFieldsLocked}>
				<span>{m.ticket_preset()}</span>
				<Select
					value={preset}
					options={[
						{ id: 'free', label: m.preset_free() },
						{ id: 'simple', label: m.preset_simple() },
						{ id: 'allocated', label: m.preset_allocated() },
						{ id: 'advanced', label: m.preset_advanced() }
					]}
					onchange={({ value }) => changePreset(value)} />
				<p class="muted">{m.ticket_preset_help()}</p>
			</div>
			<TicketFields
				value={form}
				{groups}
				{invalidField}
				showName={preset !== 'none'}
				showPrice={preset !== 'none' &&
					preset !== 'free' &&
					!(preset === 'allocated' && allocatedFree)}
				showDates={preset !== 'none'}
				showInvitedToggle={preset === 'allocated'}
				invited={allocatedFree}
				singleGroup={preset === 'none'}
				releaseStartLocked={Boolean(originalTicket?.has_been_released)}
				priceLocked={purchasedFieldsLocked}
				groupsLocked={purchasedFieldsLocked}
				oninvitedchange={toggleAllocatedFree}
				onchange={updateTicketForm} />
			<div class="grid-2">
				{#if preset === 'allocated' || preset === 'advanced'}
					<label class="field"
						><span>{preset === 'allocated' ? m.guaranteed_tickets() : m.minimum_tickets()}</span
						><input
							type="number"
							min="0"
							value={form.min_tickets}
							oninput={(event) =>
								updateTicketForm({
									...form,
									min_tickets: event.currentTarget.valueAsNumber
								})} /></label>
				{/if}
				{#if preset !== 'none'}
					<div class="field" class:field-error={invalidField === m.maximum_tickets()}>
						<label class="switch-field">
							<Switch value={limitMaximum} onchange={({ value }) => toggleMaximum(value)} />
							<span>{m.limit_max_tickets()}</span>
						</label>
						{#if limitMaximum}
							<input
								type="number"
								aria-label={m.maximum_tickets()}
								aria-invalid={invalidField === m.maximum_tickets()}
								min="0"
								max={I32_MAX - 1}
								bind:value={form.max_tickets} />
						{/if}
					</div>
				{/if}
			</div>
			{#if preset !== 'none'}
				<section class="stack transfer-settings">
					<div>
						<h2 class="section-title">{m.transfer_settings()}</h2>
						<p class="muted">
							{form.min_tickets > 0
								? m.transfer_default_allocated()
								: m.transfer_default_ordinary()}
						</p>
						{#if transferGroupsDefault}
							<p>{m.transfer_groups_using_defaults()}</p>
						{:else}
							<button
								type="button"
								class="button-link secondary mt-2"
								onclick={() => {
									form.transfer_group_ids = [...defaultGroupIds];
									customizingTransfers = false;
								}}>{m.reset_transfer_groups()}</button>
						{/if}
					</div>
					{#if !customizingTransfers && transferGroupsDefault && transfersEnabled && !limitedTransferWindow}
						<button
							type="button"
							class="button-link secondary"
							onclick={() => (customizingTransfers = true)}>{m.customize_transfers()}</button>
					{:else}
						<div class="switch-group">
							<label class="switch-field">
								<Switch value={transfersEnabled} onchange={({ value }) => toggleTransfers(value)} />
								<span>{m.allow_transfers()}</span>
							</label>
							{#if transfersEnabled}
								<label class="switch-field">
									<Switch
										value={limitedTransferWindow}
										onchange={({ value }) => toggleTransferWindow(value)} />
									<span>{m.limit_transfer_window()}</span>
								</label>
							{/if}
						</div>
						{#if transfersEnabled}
							{#if limitedTransferWindow}
								<div class="date-range">
									<DateTimePicker
										label={m.transfer_from()}
										value={form.allow_transfer_ticket_start}
										onchange={(value) => (form.allow_transfer_ticket_start = value)} />
									<DateTimePicker
										label={m.transfer_until()}
										value={form.allow_transfer_ticket_stop}
										error={new Date(form.allow_transfer_ticket_stop) <=
											new Date(form.allow_transfer_ticket_start)}
										onchange={(value) => (form.allow_transfer_ticket_stop = value)} />
								</div>
							{/if}
							<GroupTreePicker
								title={m.transfer_groups()}
								{groups}
								selectedIds={form.transfer_group_ids}
								inheritDescendants
								onchange={(ids) => {
									form.transfer_group_ids = ids;
								}} />
							<p class="muted">{m.transfer_groups_descendants()}</p>
						{/if}
					{/if}
				</section>
			{/if}
		</section>

		{#if preset !== 'none'}
			<section class="card card-pad stack">
				<h2>{m.addons()}</h2>
				<label class="switch-field">
					<Switch
						value={hasDietaryPreferencesAddon(form.addons)}
						disabled={purchasedFieldsLocked}
						onchange={({ value }) => {
							form.addons = setDietaryPreferencesAddon(
								$state.snapshot(form.addons),
								value,
								$state.snapshot([...form.addons, ...reusableAddons])
							);
						}} />
					<span>{m.include_dietary_preferences()}</span>
				</label>
				<p class="muted">{m.create_addons_in_activity()}</p>
				{#each optionalAddons as addon (addon.id)}
					<label class="switch-field">
						<input
							type="checkbox"
							disabled={purchasedFieldsLocked}
							checked={form.addons.some((item) => item.id === addon.id)}
							onchange={(event) => {
								const checked = event.currentTarget.checked;
								const remaining = form.addons.filter((item) => item.id !== addon.id);
								form.addons = checked
									? [...remaining, structuredClone($state.snapshot(addon))]
									: remaining;
							}} />
						<span>{localize(addon.name)}</span>
					</label>
				{/each}
			</section>
		{/if}

		<div class="editor-action-dock">
			<button class="button-link" type="submit" disabled={saving}
				>{saving ? m.saving() : m.save()}</button>
			{#if id}
				<button
					class="button-link secondary danger-button"
					type="button"
					disabled={saving || !canDelete}
					title={canDelete ? undefined : m.delete_ticket_kind_unavailable()}
					onclick={() => void removeTicketKind()}>
					<Trash2 size={17} />
					{m.delete_ticket_kind()}
				</button>
			{/if}
		</div>
	</form>
{/if}
