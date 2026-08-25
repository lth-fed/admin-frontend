<script lang="ts">
	import { beforeNavigate, goto, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		deleteTicketKind,
		getActivity,
		getTicketKind,
		listActivityTicketKinds,
		listGroupTree,
		saveTicketKind
	} from '$lib/api/admin';
	import { ApiError, frontendError } from '$lib/api/client';
	import { defaultTicketRelease, ticketReleaseIsTooSoon } from '$lib/activity-form';
	import { loadAddonNameOptions } from '$lib/addon-names';
	import type { Group, PutTicketKind } from '$lib/api/types';
	import AddonEditor from '$lib/components/AddonEditor.svelte';
	import DateTimePicker from '$lib/components/DateTimePicker.svelte';
	import TicketFields from '$lib/components/TicketFields.svelte';
	import { copiedLocalizedTitle, localize } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import {
		applyTicketPreset,
		copyTicketAddons,
		createDietaryPreferencesAddon,
		detectTicketPreset,
		hasDietaryPreferencesAddon,
		isDietaryPreferencesAddon,
		setDietaryPreferencesAddon,
		ticketAddonDataKey,
		type TicketPresetId,
		UNLIMITED_TICKETS
	} from '$lib/ticket-presets';
	import { toasts } from '$lib/toasts.svelte';
	import { ArrowLeft, Copy, Trash2 } from '@lucide/svelte';
	import { Select, Switch } from '@svar-ui/svelte-core';
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';

	const I32_MAX = UNLIMITED_TICKETS;
	type ValidationIssue = { field: string; message: string };
	type DuplicateTicketNavigationState = { duplicatedTicket?: PutTicketKind };

	let { id, activityId }: { id: string | null; activityId: string } = $props();
	let loading = $state(false);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let invalidField = $state<string | null>(null);
	let groups = $state<Group[]>([]);
	let addonNameSuggestions = $state<PutTicketKind['name'][]>([]);
	let reusableAddons = $state<PutTicketKind['addons']>([]);
	let overriddenAddonIds = $state<string[]>([]);
	let originalTicket = $state<Awaited<ReturnType<typeof getTicketKind>> | null>(null);
	let limitMaximum = $state(false);
	let transfersEnabled = $state(true);
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
		max_tickets: 1,
		min_tickets: 0,
		allow_transfer_ticket_start: new Date().toISOString(),
		allow_transfer_ticket_stop: new Date(Date.now() + 31_536_000_000).toISOString(),
		allow_transfer_ticket_bypass_allowed_groups: false,
		allowed_group_ids: [],
		addons: [createDietaryPreferencesAddon()]
	});
	let savedTicketSnapshot = $state('');
	let allowNavigation = $state(false);
	let now = $state(Date.now());
	const ticketDirty = $derived(
		savedTicketSnapshot !== '' && serializeTicketEditor() !== savedTicketSnapshot
	);
	const hasUnsavedChanges = $derived(ticketDirty);
	const bookkeepingOnly = $derived(Boolean(originalTicket?.has_been_purchased));
	const canDelete = $derived(
		Boolean(
			originalTicket &&
			!originalTicket.has_been_purchased &&
			!originalTicket.has_been_released &&
			new Date(originalTicket.purchasing_available_start).getTime() > now + 20 * 60_000
		)
	);
	const lockedAddonIds = $derived(
		form.addons
			.filter(
				(addon) =>
					!overriddenAddonIds.includes(addon.id) &&
					reusableAddons.some(
						(candidate) => ticketAddonDataKey(candidate) === ticketAddonDataKey(addon)
					)
			)
			.map((addon) => addon.id)
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
		void load();
	});

	async function load(): Promise<void> {
		loading = true;
		error = null;
		try {
			if (!id) {
				const [groupTree, addonNames, activity, activityTickets] = await Promise.all([
					listGroupTree(),
					loadAddonNameOptions(),
					getActivity(activityId),
					listActivityTicketKinds(activityId)
				]);
				reusableAddons = (
					await Promise.all(activityTickets.map((ticket) => getTicketKind(ticket.id)))
				).flatMap((ticket) => structuredClone(ticket.available_addons));
				form.addons = setDietaryPreferencesAddon([], true, reusableAddons);
				groups = groupTree;
				addonNameSuggestions = addonNames;
				activityStart = activity.time_start;
				form.activity_id = activityId;
				form.allow_transfer_ticket_start = form.purchasing_available_start;
				form.allow_transfer_ticket_stop = activityStart;
				savedTicketSnapshot = serializeTicketEditor();
				return;
			}
			const [ticket, groupTree, addonNames] = await Promise.all([
				getTicketKind(id),
				listGroupTree(),
				loadAddonNameOptions()
			]);
			originalTicket = ticket;
			const [activity, activityTickets] = await Promise.all([
				getActivity(ticket.activity_id),
				listActivityTicketKinds(ticket.activity_id)
			]);
			activityStart = activity.time_start;
			reusableAddons = (
				await Promise.all(
					activityTickets
						.filter((activityTicket) => activityTicket.id !== ticket.ticket_kind_id)
						.map((activityTicket) => getTicketKind(activityTicket.id))
				)
			).flatMap((activityTicket) => structuredClone(activityTicket.available_addons));
			preset = detectTicketPreset(ticket);
			allocatedFree = preset === 'allocated' && ticket.price === 0;
			allocatedPaidPrice = ticket.price;
			const loadedForm: PutTicketKind = {
				activity_id: ticket.activity_id,
				name: { ...ticket.ticket_kind_name },
				price: ticket.price,
				purchasing_available_start: ticket.purchasing_available_start,
				purchasing_available_stop: ticket.purchasing_available_stop,
				max_tickets: ticket.max_tickets,
				min_tickets: ticket.min_tickets,
				allow_transfer_ticket_start: ticket.allow_transfer_ticket_start,
				allow_transfer_ticket_stop: ticket.allow_transfer_ticket_stop,
				allow_transfer_ticket_bypass_allowed_groups:
					ticket.allow_transfer_ticket_bypass_allowed_groups,
				allowed_group_ids: [...ticket.allowed_group_ids],
				addons: structuredClone(ticket.available_addons)
			};
			const duplicatedTicket = (page.state as DuplicateTicketNavigationState).duplicatedTicket;
			form =
				duplicatedTicket?.activity_id === ticket.activity_id
					? structuredClone($state.snapshot(duplicatedTicket))
					: loadedForm;
			if (duplicatedTicket) replaceState(resolve('/tickets/[id]', { id }), {});
			groups = groupTree;
			addonNameSuggestions = addonNames;
			limitMaximum = ticket.max_tickets !== I32_MAX;
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

	function sameValues(one: string[], two: string[]): boolean {
		return [...one].sort().join('|') === [...two].sort().join('|');
	}

	function immutableTicketFieldsMatch(
		body: PutTicketKind,
		addons: PutTicketKind['addons']
	): boolean {
		if (!originalTicket?.has_been_purchased) return true;
		if (
			body.price !== originalTicket.price ||
			!sameValues(body.allowed_group_ids, originalTicket.allowed_group_ids) ||
			addons.length !== originalTicket.available_addons.length
		)
			return false;
		return addons.every((addon, index) => {
			const old = originalTicket!.available_addons[index];
			return (
				addon.id === old.id &&
				JSON.stringify(addon.name) === JSON.stringify(old.name) &&
				addon.multiple_alternatives === old.multiple_alternatives &&
				addon.has_text_field === old.has_text_field &&
				addon.required === old.required &&
				addon.options.length === old.options.length &&
				addon.options.every((option, optionIndex) => {
					const oldOption = old.options[optionIndex];
					return (
						option.id === oldOption.id &&
						JSON.stringify(option.name) === JSON.stringify(oldOption.name) &&
						option.price === oldOption.price
					);
				})
			);
		});
	}

	function validAddons(addons: PutTicketKind['addons']): boolean {
		if (!Array.isArray(addons)) return false;
		const ids = new SvelteSet<string>();
		const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
		for (const addon of addons) {
			if (
				!uuid.test(addon.id) ||
				ids.has(addon.id) ||
				!addon.name?.sv?.trim() ||
				!addon.name?.en?.trim() ||
				!Array.isArray(addon.options)
			)
				return false;
			ids.add(addon.id);
			for (const option of addon.options) {
				if (
					!uuid.test(option.id) ||
					ids.has(option.id) ||
					!option.name?.sv?.trim() ||
					!option.name?.en?.trim() ||
					!Number.isSafeInteger(option.price) ||
					option.price < 0 ||
					option.bookkeeping_prices.length !== option.bookkeeping_price_categories.length ||
					option.bookkeeping_price_categories.some((category) => !category.trim()) ||
					option.bookkeeping_prices.some((price) => !Number.isSafeInteger(price)) ||
					option.bookkeeping_prices.reduce((sum, price) => sum + price, 0) !== option.price
				)
					return false;
				ids.add(option.id);
			}
		}
		return true;
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
			return { field: m.maximum_tickets(), message: m.ticket_capacity_reserved() };
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
		if (!body.allowed_group_ids.every((groupId) => uuid.test(groupId)))
			return { field: m.allowed_groups(), message: m.invalid_group_ids() };
		if (preset === 'none' && body.allowed_group_ids.length !== 1)
			return { field: m.allowed_groups(), message: m.preset_requires_one_group() };
		if (preset === 'allocated' && body.allowed_group_ids.length === 0)
			return { field: m.allowed_groups(), message: m.required_fields() };
		if (!validAddons(addons)) return { field: m.addons(), message: m.ticket_addons_invalid() };
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
		const originalBody: PutTicketKind = {
			activity_id: originalTicket.activity_id,
			name: { ...originalTicket.ticket_kind_name },
			price: originalTicket.price,
			purchasing_available_start: originalTicket.purchasing_available_start,
			purchasing_available_stop: originalTicket.purchasing_available_stop,
			max_tickets: originalTicket.max_tickets,
			min_tickets: originalTicket.min_tickets,
			allow_transfer_ticket_start: originalTicket.allow_transfer_ticket_start,
			allow_transfer_ticket_stop: originalTicket.allow_transfer_ticket_stop,
			allow_transfer_ticket_bypass_allowed_groups:
				originalTicket.allow_transfer_ticket_bypass_allowed_groups,
			allowed_group_ids: [...originalTicket.allowed_group_ids],
			addons: $state.snapshot(originalTicket.available_addons)
		};
		await saveTicketKind(id, { ...originalBody, purchasing_available_stop: now });

		const replacementId = crypto.randomUUID();
		try {
			await saveTicketKind(replacementId, {
				...body,
				name: { sv: `${body.name.sv} v2`, en: `${body.name.en} v2` },
				addons: copyTicketAddons(body.addons)
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
		limitMaximum = enabled;
		form.max_tickets = enabled
			? Math.max(form.min_tickets + 1, originalTicket?.reserved_or_purchased_tickets ?? 0, 1)
			: I32_MAX;
	}

	function toggleTransfers(enabled: boolean): void {
		transfersEnabled = enabled;
		if (enabled) {
			form.allow_transfer_ticket_start = form.purchasing_available_start;
			form.allow_transfer_ticket_stop = activityStart;
		}
	}

	function updateTicketForm(value: PutTicketKind): void {
		if (form.allow_transfer_ticket_start === form.purchasing_available_start)
			value.allow_transfer_ticket_start = value.purchasing_available_start;
		form = value;
	}

	function changePreset(next: string | number): void {
		const selected = String(next) as TicketPresetId;
		if (selected === preset || bookkeepingOnly) return;
		const previousPreset = preset;
		const removesAddons =
			(selected === 'none' && form.addons.length > 0) ||
			(selected === 'free' &&
				(form.addons.length !== 1 || !isDietaryPreferencesAddon(form.addons[0])));
		if (removesAddons && !confirm(m.preset_removes_addons())) return;
		preset = selected;
		form = { ...form, ...applyTicketPreset(form, selected) };
		if (previousPreset === 'none' && selected !== 'none') toggleTransfers(true);
		limitMaximum = form.max_tickets !== I32_MAX;
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

	function toggleDietaryPreferences(enabled: boolean): void {
		form.addons = setDietaryPreferencesAddon(form.addons, enabled, reusableAddons);
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
			await saveTicketKind(ticketId, body);
			form = body;
			savedTicketSnapshot = serializeTicketEditor();
			if (!id) {
				allowNavigation = true;
				await goto(resolve('/tickets/[id]', { id: ticketId }), { replaceState: true });
			}
		} catch (cause) {
			if (
				id &&
				!bookkeepingOnly &&
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
				name: copiedLocalizedTitle(copy.name),
				addons: copyTicketAddons(copy.addons)
			};
			const futureStart = new Date(Date.now() + 100 * 365 * 86_400_000);
			const futureStop = new Date(futureStart.getTime() + 365 * 86_400_000);
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

	function overrideSharedAddon(addonId: string): void {
		if (!confirm(m.override_shared_addon_confirm())) return;
		overriddenAddonIds = [...overriddenAddonIds, addonId];
	}
</script>

<header class="page-header edit-page-header">
	<div>
		<p class="eyebrow">{m.tickets()}</p>
		<h1>
			{m.ticket_editor()} · {localize(form.name, '').trim() || m.empty_ticket_kind()}
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
		{#if bookkeepingOnly}<p class="info-banner" role="status">{m.bookkeeping_only()}</p>{/if}
		<section class="card card-pad" inert={bookkeepingOnly}>
			<div class="field preset-field">
				<span>{m.ticket_preset()}</span>
				<Select
					value={preset}
					options={[
						{ id: 'none', label: m.preset_none() },
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
				capacityLabel={preset === 'free' || preset === 'simple' ? m.maximum_tickets() : undefined}
				singleGroup={preset === 'none'}
				releaseStartLocked={Boolean(originalTicket?.has_been_released)}
				oninvitedchange={toggleAllocatedFree}
				onchange={updateTicketForm} />
			<div class="grid-2">
				{#if preset === 'allocated' || preset === 'advanced'}
					<label class="field"
						><span>{preset === 'allocated' ? m.guaranteed_tickets() : m.minimum_tickets()}</span
						><input type="number" min="0" bind:value={form.min_tickets} /></label>
				{/if}
				{#if preset === 'advanced'}
					<div class="field">
						<label class="switch-field">
							<Switch value={limitMaximum} onchange={({ value }) => toggleMaximum(value)} />
							<span>{m.limit_max_tickets()}</span>
						</label>
						{#if limitMaximum}
							<input type="number" min="0" max={I32_MAX - 1} bind:value={form.max_tickets} />
						{/if}
					</div>
				{/if}
			</div>
			{#if preset !== 'none'}<div class="stack transfer-settings">
					<label class="switch-field">
						<Switch value={transfersEnabled} onchange={({ value }) => toggleTransfers(value)} />
						<span>{m.allow_transfers()}</span>
					</label>
					{#if transfersEnabled}
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
						<label class="switch-field">
							<Switch
								value={form.allow_transfer_ticket_bypass_allowed_groups}
								onchange={({ value }) =>
									(form.allow_transfer_ticket_bypass_allowed_groups = value)} />
							<span>{m.transfer_bypass()}</span>
						</label>
					{/if}
				</div>{/if}
		</section>

		{#if preset === 'free' || preset === 'simple' || preset === 'allocated'}
			<label class="switch-field dietary-preferences-toggle" inert={bookkeepingOnly}>
				<Switch
					value={hasDietaryPreferencesAddon(form.addons)}
					onchange={({ value }) => toggleDietaryPreferences(value)} />
				<span>{m.include_dietary_preferences()}</span>
			</label>
		{/if}

		{#if preset === 'simple' || preset === 'allocated' || preset === 'advanced'}
			<AddonEditor
				addons={form.addons}
				{reusableAddons}
				{lockedAddonIds}
				suggestions={addonNameSuggestions}
				disabled={bookkeepingOnly}
				onoverride={overrideSharedAddon}
				onchange={(addons) => (form.addons = addons)} />
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
