<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		deleteNotification,
		getTicketKind,
		listGroupTree,
		listNotifications,
		listPurchasedTickets,
		saveNotification,
		saveTicketKind
	} from '$lib/api/admin';
	import { ApiError, frontendError } from '$lib/api/client';
	import { loadAddonNameOptions } from '$lib/addon-names';
	import type {
		Group,
		PurchasedTicket,
		PutTicketKind,
		PutTicketNotification,
		TicketNotification
	} from '$lib/api/types';
	import DateTimePicker from '$lib/components/DateTimePicker.svelte';
	import BookkeepingCategorySelect from '$lib/components/BookkeepingCategorySelect.svelte';
	import LocalizedField from '$lib/components/LocalizedField.svelte';
	import MoneyInput from '$lib/components/MoneyInput.svelte';
	import RelationList from '$lib/components/RelationList.svelte';
	import { dateTime, kronor, localize } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import {
		applyTicketPreset,
		createDietaryPreferencesAddon,
		detectTicketPreset,
		isDietaryPreferencesAddon,
		type TicketPresetId,
		UNLIMITED_TICKETS
	} from '$lib/ticket-presets';
	import { toasts } from '$lib/toasts.svelte';
	import { ArrowLeft, Copy, Plus, Trash2 } from '@lucide/svelte';
	import { Select, Switch } from '@svar-ui/svelte-core';
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';

	const I32_MAX = UNLIMITED_TICKETS;
	type ValidationIssue = { field: string; message: string };
	type TicketAddon = PutTicketKind['addons'][number];
	type TicketAddonOption = TicketAddon['options'][number];

	let { id, activityId }: { id: string | null; activityId: string } = $props();
	let loading = $state(false);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let groups = $state<Group[]>([]);
	let purchasers = $state<PurchasedTicket[]>([]);
	let scheduledNotifications = $state<TicketNotification[]>([]);
	let addonNameSuggestions = $state<PutTicketKind['name'][]>([]);
	let originalTicket = $state<Awaited<ReturnType<typeof getTicketKind>> | null>(null);
	let limitMaximum = $state(false);
	let transfersEnabled = $state(true);
	let preset = $state<TicketPresetId>('simple');
	let allocatedFree = $state(false);
	let allocatedPaidPrice = $state(0);
	let notificationKind = $state('reminder');
	let notification = $state<PutTicketNotification>({
		title: { sv: '', en: '' },
		content: { sv: '', en: '' },
		send_at: new Date(Date.now() + 86_400_000).toISOString()
	});
	let form = $state<PutTicketKind>({
		activity_id: '',
		name: { sv: '', en: '' },
		price: 0,
		purchasing_available_start: new Date().toISOString(),
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
	let savedNotificationSnapshot = $state('');
	let allowNavigation = $state(false);
	let now = $state(Date.now());
	const selectedAllowedGroups = $derived(
		groups.filter((group) => form.allowed_group_ids.includes(group.id))
	);
	const ticketDirty = $derived(
		savedTicketSnapshot !== '' && serializeTicketEditor() !== savedTicketSnapshot
	);
	const notificationDirty = $derived(
		id !== null &&
			savedNotificationSnapshot !== '' &&
			serializeNotificationEditor() !== savedNotificationSnapshot
	);
	const hasUnsavedChanges = $derived(ticketDirty || notificationDirty);
	const bookkeepingOnly = $derived(
		Boolean(
			originalTicket?.has_been_purchased &&
			new Date(originalTicket.purchasing_available_stop).getTime() <= now
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
		void load();
	});

	async function load(): Promise<void> {
		loading = true;
		error = null;
		try {
			if (!id) {
				[groups, addonNameSuggestions] = await Promise.all([
					listGroupTree(),
					loadAddonNameOptions()
				]);
				form.activity_id = activityId;
				savedTicketSnapshot = serializeTicketEditor();
				savedNotificationSnapshot = serializeNotificationEditor();
				return;
			}
			const [ticket, bought, groupTree, notifications, addonNames] = await Promise.all([
				getTicketKind(id),
				listPurchasedTickets(id),
				listGroupTree(),
				listNotifications(id),
				loadAddonNameOptions()
			]);
			originalTicket = ticket;
			preset = detectTicketPreset(ticket);
			allocatedFree = preset === 'allocated' && ticket.price === 0;
			allocatedPaidPrice = ticket.price;
			form = {
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
			purchasers = bought;
			groups = groupTree;
			addonNameSuggestions = addonNames;
			scheduledNotifications = notifications;
			limitMaximum = ticket.max_tickets !== I32_MAX;
			transfersEnabled =
				new Date(ticket.allow_transfer_ticket_stop) > new Date(ticket.allow_transfer_ticket_start);
			savedTicketSnapshot = serializeTicketEditor();
			savedNotificationSnapshot = serializeNotificationEditor();
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			loading = false;
		}
	}

	function serializeTicketEditor(): string {
		return JSON.stringify({ form, transfersEnabled, preset, allocatedFree });
	}

	function serializeNotificationEditor(): string {
		return JSON.stringify({ notificationKind, notification });
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
		const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
		if (!body.allowed_group_ids.every((groupId) => uuid.test(groupId)))
			return { field: m.allowed_groups(), message: m.invalid_group_ids() };
		if ((preset === 'none' || preset === 'allocated') && body.allowed_group_ids.length !== 1)
			return { field: m.allowed_groups(), message: m.preset_requires_one_group() };
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
				addons: copiedAddons(body.addons)
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
		if (
			enabled &&
			new Date(form.allow_transfer_ticket_stop) <= new Date(form.allow_transfer_ticket_start)
		) {
			form.allow_transfer_ticket_start = new Date().toISOString();
			form.allow_transfer_ticket_stop = new Date(Date.now() + 31_536_000_000).toISOString();
		}
	}

	function changePreset(next: string | number): void {
		const selected = String(next) as TicketPresetId;
		if (selected === preset || bookkeepingOnly) return;
		const removesAddons =
			(selected === 'none' && form.addons.length > 0) ||
			(selected === 'free' &&
				(form.addons.length !== 1 || !isDietaryPreferencesAddon(form.addons[0])));
		if (removesAddons && !confirm(m.preset_removes_addons())) return;
		preset = selected;
		form = { ...form, ...applyTicketPreset(form, selected) };
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

	function addAllowedGroup(groupId: string): void {
		if (!groups.some((group) => group.id === groupId)) {
			showValidation(m.allowed_groups(), m.invalid_group_ids());
			return;
		}
		if (preset === 'none' || preset === 'allocated') {
			form.allowed_group_ids = [groupId];
		} else if (!form.allowed_group_ids.includes(groupId)) {
			form.allowed_group_ids = [...form.allowed_group_ids, groupId];
		}
	}

	function removeAllowedGroup(groupId: string): void {
		form.allowed_group_ids = form.allowed_group_ids.filter((id) => id !== groupId);
	}

	function addAddon(): void {
		form.addons = [
			...form.addons,
			{
				id: crypto.randomUUID(),
				name: { sv: '', en: '' },
				multiple_alternatives: false,
				has_text_field: false,
				required: false,
				options: []
			}
		];
	}

	function updateAddon(addonIndex: number, update: Partial<TicketAddon>): void {
		form.addons[addonIndex] = { ...form.addons[addonIndex], ...update };
	}

	function removeAddon(addonIndex: number): void {
		form.addons = form.addons.filter((_, index) => index !== addonIndex);
	}

	function copiedAddons(addons: PutTicketKind['addons']): PutTicketKind['addons'] {
		return $state.snapshot(addons).map((addon) => ({
			...addon,
			id: crypto.randomUUID(),
			options: addon.options.map((option) => ({ ...option, id: crypto.randomUUID() }))
		}));
	}

	function duplicateAddon(addonIndex: number): void {
		const [copy] = copiedAddons([form.addons[addonIndex]]);
		copy.name = {
			sv: `${copy.name.sv} (kopia)`,
			en: `${copy.name.en} (copy)`
		};
		form.addons = [
			...form.addons.slice(0, addonIndex + 1),
			copy,
			...form.addons.slice(addonIndex + 1)
		];
	}

	function addAddonOption(addonIndex: number): void {
		const option: TicketAddonOption = {
			id: crypto.randomUUID(),
			idx: form.addons[addonIndex].options.length,
			name: { sv: '', en: '' },
			price: 0,
			bookkeeping_prices: [0],
			bookkeeping_price_categories: ['null']
		};
		form.addons[addonIndex].options = [...form.addons[addonIndex].options, option];
	}

	function updateAddonOption(
		addonIndex: number,
		optionIndex: number,
		update: Partial<TicketAddonOption>
	): void {
		const addon = form.addons[addonIndex];
		addon.options[optionIndex] = { ...addon.options[optionIndex], ...update };
	}

	function removeAddonOption(addonIndex: number, optionIndex: number): void {
		const addon = form.addons[addonIndex];
		addon.options = addon.options.filter((_, index) => index !== optionIndex);
	}

	function addBookkeepingCategory(addonIndex: number, optionIndex: number): void {
		const option = form.addons[addonIndex].options[optionIndex];
		option.bookkeeping_price_categories = [...option.bookkeeping_price_categories, 'null'];
		option.bookkeeping_prices = [...option.bookkeeping_prices, 0];
	}

	function updateBookkeepingCategory(
		addonIndex: number,
		optionIndex: number,
		categoryIndex: number,
		category: string
	): void {
		form.addons[addonIndex].options[optionIndex].bookkeeping_price_categories[categoryIndex] =
			category;
	}

	function updateBookkeepingPrice(
		addonIndex: number,
		optionIndex: number,
		categoryIndex: number,
		price: number
	): void {
		form.addons[addonIndex].options[optionIndex].bookkeeping_prices[categoryIndex] = price;
	}

	function removeBookkeepingCategory(
		addonIndex: number,
		optionIndex: number,
		categoryIndex: number
	): void {
		const option = form.addons[addonIndex].options[optionIndex];
		option.bookkeeping_price_categories = option.bookkeeping_price_categories.filter(
			(_, index) => index !== categoryIndex
		);
		option.bookkeeping_prices = option.bookkeeping_prices.filter(
			(_, index) => index !== categoryIndex
		);
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		saving = true;
		error = null;
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

	function selectScheduledNotification(selected: TicketNotification): void {
		if (notificationDirty && !confirm(m.discard_notification_changes())) return;
		notificationKind = selected.kind;
		notification = {
			title: { ...selected.title },
			content: { ...selected.content },
			send_at: selected.send_at
		};
		savedNotificationSnapshot = serializeNotificationEditor();
	}

	async function submitNotification(): Promise<void> {
		if (!id) return;
		error = null;
		if (!notificationKind.trim()) return showValidation(m.notification_kind(), m.required_fields());
		if (!notification.title.sv.trim())
			return showValidation(m.notification_title_sv(), m.required_fields());
		if (!notification.title.en.trim())
			return showValidation(m.notification_title_en(), m.required_fields());
		if (!notification.content.sv.trim())
			return showValidation(m.notification_content_sv(), m.required_fields());
		if (!notification.content.en.trim())
			return showValidation(m.notification_content_en(), m.required_fields());
		try {
			const saved = await saveNotification(id, notificationKind, notification);
			notification = { title: saved.title, content: saved.content, send_at: saved.send_at };
			scheduledNotifications = await listNotifications(id);
			savedNotificationSnapshot = serializeNotificationEditor();
		} catch (cause) {
			error = frontendError(cause);
		}
	}

	async function removeScheduledNotification(kind: string): Promise<void> {
		if (!id || !confirm(m.delete_notification_confirm())) return;
		error = null;
		try {
			await deleteNotification(id, kind);
			scheduledNotifications = scheduledNotifications.filter(
				(notification) => notification.kind !== kind
			);
			if (notificationKind === kind) {
				notificationKind = '';
				notification = {
					title: { sv: '', en: '' },
					content: { sv: '', en: '' },
					send_at: new Date(Date.now() + 86_400_000).toISOString()
				};
				savedNotificationSnapshot = serializeNotificationEditor();
			}
		} catch (cause) {
			error = frontendError(cause);
		}
	}

	async function duplicateTicketKind(): Promise<void> {
		if (!id) return;
		saving = true;
		error = null;
		try {
			const ticketId = crypto.randomUUID();
			const copy = $state.snapshot(form);
			await saveTicketKind(ticketId, {
				...copy,
				name: {
					sv: `${copy.name.sv} (kopia)`,
					en: `${copy.name.en} (copy)`
				},
				addons: copiedAddons(copy.addons)
			});
			allowNavigation = true;
			await goto(resolve('/tickets/[id]', { id: ticketId }));
		} catch (cause) {
			allowNavigation = false;
			error = frontendError(cause);
		} finally {
			saving = false;
		}
	}
</script>

<header class="page-header">
	<div>
		<p class="eyebrow">{m.tickets()}</p>
		<h1>
			{m.ticket_editor()}{form.name.sv || form.name.en ? ` · ${localize(form.name)}` : ''}
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
			href={form.activity_id ? resolve('/activities/[id]', { id: form.activity_id }) : resolve('/')}
			><ArrowLeft size={18} /> {m.back()}</a>
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
			<div class="grid-2">
				{#if preset !== 'none'}
					<LocalizedField
						value={form.name}
						labelSv={m.name_sv()}
						labelEn={m.name_en()}
						required
						onchange={(value) => (form.name = value)} />
				{/if}
				{#if preset !== 'none' && preset !== 'free' && !(preset === 'allocated' && allocatedFree)}
					<MoneyInput
						label={m.price()}
						value={form.price}
						onchange={(value) => (form.price = value ?? Number.NaN)} />
				{/if}
				{#if preset === 'allocated' || preset === 'advanced'}
					<label class="field"
						><span>{preset === 'allocated' ? m.guaranteed_tickets() : m.minimum_tickets()}</span
						><input type="number" min="0" bind:value={form.min_tickets} /></label>
				{/if}
				{#if preset === 'free' || preset === 'simple'}
					<label class="field"
						><span>{m.maximum_tickets()}</span><input
							type="number"
							min="1"
							max={I32_MAX - 1}
							bind:value={form.max_tickets} /></label>
				{:else if preset === 'advanced'}
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
				{#if preset === 'allocated'}
					<label class="switch-field">
						<Switch value={allocatedFree} onchange={({ value }) => toggleAllocatedFree(value)} />
						<span>{m.invited_ticket()}</span>
					</label>
				{/if}
				{#if preset !== 'none'}
					<div class="date-range">
						<DateTimePicker
							label={m.available_from()}
							value={form.purchasing_available_start}
							onchange={(value) => (form.purchasing_available_start = value)} />
						<DateTimePicker
							label={m.available_until()}
							value={form.purchasing_available_stop}
							error={new Date(form.purchasing_available_stop) <=
								new Date(form.purchasing_available_start)}
							onchange={(value) => (form.purchasing_available_stop = value)} />
					</div>
				{/if}
			</div>
			<RelationList
				title={m.allowed_groups()}
				items={selectedAllowedGroups}
				options={groups}
				placeholder={m.group_id()}
				onadd={addAllowedGroup}
				onremove={removeAllowedGroup} />
			{#if preset === 'advanced'}<div class="stack transfer-settings">
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

		{#if preset === 'simple' || preset === 'allocated' || preset === 'advanced'}<section
				class="card card-pad stack">
				<div class="toolbar between">
					<h2 class="section-title">
						{m.addons()} <span class="pill">{form.addons.length}</span>
					</h2>
					<button
						class="button-link secondary"
						type="button"
						disabled={bookkeepingOnly}
						onclick={addAddon}>
						<Plus size={17} />
						{m.add_addon()}
					</button>
				</div>
				{#if form.addons.length === 0}
					<p class="empty-state">{m.empty()}</p>
				{:else}
					<div class="stack">
						{#each form.addons as addon, addonIndex (addon.id)}
							<article class="nested-card stack">
								<div class="toolbar between">
									<h3 class="section-title">{m.addon_number({ number: addonIndex + 1 })}</h3>
									<div class="toolbar">
										<button
											class="button-link secondary"
											type="button"
											disabled={bookkeepingOnly}
											onclick={() => duplicateAddon(addonIndex)}>
											<Copy size={16} />
											{m.duplicate_addon()}
										</button>
										<button
											class="button-link secondary danger-button"
											type="button"
											disabled={bookkeepingOnly}
											onclick={() => removeAddon(addonIndex)}>
											<Trash2 size={16} />
											{m.remove()}
										</button>
									</div>
								</div>
								<div inert={bookkeepingOnly}>
									<LocalizedField
										value={addon.name}
										labelSv={m.addon_name_sv()}
										labelEn={m.addon_name_en()}
										suggestions={addonNameSuggestions}
										required
										onchange={(name) => updateAddon(addonIndex, { name })} />
								</div>
								<div class="addon-switches" inert={bookkeepingOnly}>
									<label class="switch-field">
										<Switch
											value={addon.required}
											onchange={({ value }) => updateAddon(addonIndex, { required: value })} />
										<span>{m.addon_required()}</span>
									</label>
									<label class="switch-field">
										<Switch
											value={addon.multiple_alternatives}
											onchange={({ value }) =>
												updateAddon(addonIndex, { multiple_alternatives: value })} />
										<span>{m.addon_multiple_options()}</span>
									</label>
									<label class="switch-field">
										<Switch
											value={addon.has_text_field}
											onchange={({ value }) =>
												updateAddon(addonIndex, { has_text_field: value })} />
										<span>{m.addon_text_field()}</span>
									</label>
								</div>
								<div class="toolbar between">
									<h4 class="section-title">{m.addon_options()}</h4>
									<button
										class="button-link secondary"
										type="button"
										disabled={bookkeepingOnly}
										onclick={() => addAddonOption(addonIndex)}>
										<Plus size={16} />
										{m.add_option()}
									</button>
								</div>
								{#if addon.options.length === 0}
									<p class="muted">{m.empty()}</p>
								{:else}
									<div class="stack">
										{#each addon.options as option, optionIndex (option.id)}
											<div class="option-card stack">
												<div class="toolbar between">
													<h5 class="section-title">
														{m.option_number({ number: optionIndex + 1 })}
													</h5>
													<button
														class="button-link secondary danger-button"
														type="button"
														disabled={bookkeepingOnly}
														onclick={() => removeAddonOption(addonIndex, optionIndex)}>
														<Trash2 size={15} />
														{m.remove()}
													</button>
												</div>
												<div class="grid-2" inert={bookkeepingOnly}>
													<LocalizedField
														value={option.name}
														labelSv={m.option_name_sv()}
														labelEn={m.option_name_en()}
														required
														onchange={(name) =>
															updateAddonOption(addonIndex, optionIndex, { name })} />
													<MoneyInput
														label={m.option_price()}
														value={option.price}
														onchange={(value) =>
															updateAddonOption(addonIndex, optionIndex, {
																price: value ?? Number.NaN
															})} />
												</div>
												<div class="toolbar between">
													<div>
														<h6 class="section-title">{m.bookkeeping()}</h6>
														<p class="muted">{m.bookkeeping_report_help()}</p>
														<p class="muted">
															{m.bookkeeping_total({
																total: kronor(
																	option.bookkeeping_prices.reduce((sum, price) => sum + price, 0)
																),
																price: kronor(option.price)
															})}
														</p>
													</div>
													<button
														class="button-link secondary"
														type="button"
														onclick={() => addBookkeepingCategory(addonIndex, optionIndex)}>
														<Plus size={15} />
														{m.add_bookkeeping_category()}
													</button>
												</div>
												{#each option.bookkeeping_price_categories as category, categoryIndex (`${option.id}-${categoryIndex}`)}
													<div class="bookkeeping-row">
														<BookkeepingCategorySelect
															value={category}
															onchange={(value) =>
																updateBookkeepingCategory(
																	addonIndex,
																	optionIndex,
																	categoryIndex,
																	value
																)} />
														<MoneyInput
															label={m.bookkeeping_amount()}
															value={option.bookkeeping_prices[categoryIndex]}
															onchange={(value) =>
																updateBookkeepingPrice(
																	addonIndex,
																	optionIndex,
																	categoryIndex,
																	value ?? Number.NaN
																)} />
														<button
															class="icon-button danger-button"
															type="button"
															aria-label={m.remove()}
															onclick={() =>
																removeBookkeepingCategory(addonIndex, optionIndex, categoryIndex)}>
															<Trash2 size={16} />
														</button>
													</div>
												{/each}
											</div>
										{/each}
									</div>
								{/if}
							</article>
						{/each}
					</div>
				{/if}
			</section>{/if}

		{#if id}
			<section class="card card-pad">
				<h2 class="section-title">
					{m.scheduled_notifications()}
					<span class="pill">{scheduledNotifications.length}</span>
				</h2>
				{#if scheduledNotifications.length === 0}
					<p class="empty-state">{m.empty()}</p>
				{:else}
					<ul class="list notification-list">
						{#each scheduledNotifications as scheduled (scheduled.kind)}
							<li>
								<div class="list-main">
									<strong>{localize(scheduled.title, scheduled.kind)}</strong>
									<span>{scheduled.kind} · {dateTime(scheduled.send_at)}</span>
									<span>{localize(scheduled.content)}</span>
								</div>
								<div class="toolbar">
									<button
										class="button-link secondary"
										type="button"
										onclick={() => selectScheduledNotification(scheduled)}>{m.edit()}</button>
									<button
										class="icon-button danger-button"
										type="button"
										aria-label={m.delete()}
										onclick={() => void removeScheduledNotification(scheduled.kind)}>
										<Trash2 size={16} />
									</button>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
				<h3 class="section-title notification-editor-title">{m.notification()}</h3>
				<div class="grid-3">
					<label class="field"
						><span>{m.notification_kind()}</span><input bind:value={notificationKind} /></label>
					<LocalizedField
						value={notification.title}
						labelSv={m.notification_title_sv()}
						labelEn={m.notification_title_en()}
						required
						onchange={(value) => (notification.title = value)} />
					<LocalizedField
						value={notification.content}
						labelSv={m.notification_content_sv()}
						labelEn={m.notification_content_en()}
						multiline
						required
						onchange={(value) => (notification.content = value)} />
					<DateTimePicker
						label={m.send_at()}
						value={notification.send_at}
						onchange={(value) => (notification.send_at = value)} />
				</div>
				<div class="toolbar">
					<button class="button-link" type="button" onclick={() => void submitNotification()}
						>{m.save_notification()}</button>
				</div>
			</section>

			<section class="card card-pad">
				<h2 class="section-title">
					{m.purchasers()} <span class="pill">{purchasers.length}</span>
				</h2>
				{#if purchasers.length === 0}<p class="empty-state">{m.empty()}</p>{:else}<ul class="list">
						{#each purchasers as ticket (ticket.id)}<li>
								<div class="list-main">
									<strong>{ticket.owner_id}</strong><span
										>{m.purchaser()}: {ticket.purchaser_id} · {m.addons()}: {ticket.addons
											.length}</span>
								</div>
								<code>{ticket.transaction_id}</code>
							</li>{/each}
					</ul>{/if}
			</section>
		{/if}
		<button class="button-link" type="submit" disabled={saving}
			>{saving ? m.saving() : m.save()}</button>
	</form>
{/if}
