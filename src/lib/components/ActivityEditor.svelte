<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { Pathname } from '$app/types';
	import { activityTabIndex, activityTabUrl, isActivityTabNavigation } from '$lib/activity-tabs';
	import {
		addActivityVerifier,
		deleteNotification,
		downloadActivityReport,
		getActivity,
		getTicketKind,
		getMe,
		inviteActivityHost,
		listActivityTicketKinds,
		listGroupTree,
		listNotifications,
		listPendingActivityHosts,
		listPurchasedTickets,
		listActivityVerifiers,
		removeActivityVerifier,
		saveActivity,
		saveNotification,
		saveTicketKind
	} from '$lib/api/admin';
	import { frontendError } from '$lib/api/client';
	import type {
		AdminUser,
		ActivityTicketKind,
		ExternalSaleCategory,
		Group,
		PutActivity,
		PutNotification,
		PurchasedTicket,
		ReportRequest,
		TicketKind,
		TicketNotification
	} from '$lib/api/types';
	import { loadGroupUserOptions } from '$lib/group-users';
	import ActivityDetailsFields from '$lib/components/ActivityDetailsFields.svelte';
	import ActivityLocationFields from '$lib/components/ActivityLocationFields.svelte';
	import ActivityTabs from '$lib/components/ActivityTabs.svelte';
	import BookkeepingCategorySelect from '$lib/components/BookkeepingCategorySelect.svelte';
	import GroupIcon from '$lib/components/GroupIcon.svelte';
	import GroupTreeExplorer from '$lib/components/GroupTreeExplorer.svelte';
	import GroupTreePicker from '$lib/components/GroupTreePicker.svelte';
	import MoneyInput from '$lib/components/MoneyInput.svelte';
	import NotificationFields from '$lib/components/NotificationFields.svelte';
	import PurchaseGrid from '$lib/components/PurchaseGrid.svelte';
	import UserList from '$lib/components/UserList.svelte';
	import { copiedLocalizedTitle, dateTime, kronor, localize } from '$lib/i18n';
	import { uploadImage, uploadRandomColorImage } from '$lib/image';
	import * as m from '$lib/paraglide/messages';
	import { copyTicketAddons } from '$lib/ticket-presets';
	import { ArrowLeft, Copy, Download, Eye, EyeOff, Plus, Send, Trash2 } from '@lucide/svelte';
	import { Select, Switch } from '@svar-ui/svelte-core';
	import { SvelteSet } from 'svelte/reactivity';
	import { toasts } from '$lib/toasts.svelte';
	import { parseCoordinate } from '$lib/coordinates';

	const I32_MAX = 2_147_483_647;
	type ValidationIssue = { field: string; message: string };

	let { id }: { id: string | null } = $props();
	const isNew = $derived(id === null);
	let loading = $state(true);
	let saving = $state(false);
	let reporting = $state(false);
	let uploading = $state(false);
	let error = $state<string | null>(null);
	let invalidField = $state<string | null>(null);
	let reportError = $state<string | null>(null);
	let groups = $state<Group[]>([]);
	let adminGroupIds = $state<string[]>([]);
	let tickets = $state<ActivityTicketKind[]>([]);
	let imageUrl = $state('');
	let north = $state('');
	let east = $state('');
	let contactKind = $state<'mailto' | 'tel'>('mailto');
	let limitCapacity = $state(false);
	let minimumCapacity = $state(0);
	let reportCategoryOptions = $state<string[]>([]);
	let externalSaleFees = $state<number | undefined>(undefined);
	let externalSales = $state<ExternalSaleCategory[]>([]);
	let savedHostIds = $state<string[]>([]);
	let pendingHostIds = $state<string[]>([]);
	let invitingHostId = $state<string | null>(null);
	let verifiers = $state<string[]>([]);
	let userSuggestions = $state<AdminUser[]>([]);
	let detailedTicketKinds = $state<TicketKind[]>([]);
	let purchases = $state<PurchasedTicket[]>([]);
	let editorTab = $derived(activityTabIndex(page.url));
	let visibilityGroupIds = $state<string[]>([]);
	let visibilitySaving = $state(false);
	let notificationSaving = $state(false);
	let deletingNotificationKey = $state<string | null>(null);
	let notificationTarget = $state('$all');
	let notificationKind = $state('reminder');
	let notificationDraft = $state<PutNotification>({
		title: { sv: '', en: '' },
		content: { sv: '', en: '' },
		send_at: new Date(Date.now() + 86_400_000).toISOString()
	});
	let scheduledNotifications = $state<
		Array<TicketNotification & { ticketKindId: string; ticketName: string }>
	>([]);
	let savedActivitySnapshot = $state('');
	let savedVisibilitySnapshot = $state('');
	let savedNotificationSnapshot = $state('');
	let allowNavigation = $state(false);
	const editorTabs = [
		m.creation_step_details(),
		m.creation_step_logistics(),
		m.creation_step_tickets(),
		m.creation_step_notifications()
	];
	let form = $state<PutActivity>({
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
		max_tickets: I32_MAX,
		host_ids: []
	});
	const contactValue = $derived(form.responsible_contact.replace(/^(mailto:|tel:)/, ''));
	const creatorGroup = $derived(groups.find((group) => group.id === form.creator_id));
	const canEdit = $derived(
		isNew ||
			adminGroupIds.some((groupId) => groupId === form.creator_id || savedHostIds.includes(groupId))
	);
	const purchasableTickets = $derived(
		tickets.filter(
			(ticket) =>
				detailedTicketKinds.find((kind) => kind.ticket_kind_id === ticket.id)?.max_tickets !== 0
		)
	);
	const hasUnsavedChanges = $derived(
		(savedActivitySnapshot !== '' && serializeActivity() !== savedActivitySnapshot) ||
			(savedVisibilitySnapshot !== '' && serializeVisibility() !== savedVisibilitySnapshot) ||
			(savedNotificationSnapshot !== '' && serializeNotification() !== savedNotificationSnapshot)
	);

	beforeNavigate(({ cancel, from, to, willUnload }) => {
		if (!hasUnsavedChanges || allowNavigation) return;
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

	function changeEditorTab(index: number): void {
		if (index === editorTab) return;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- helper keeps the current resolved route and changes only its tab query
		void goto(activityTabUrl(page.url, index), { keepFocus: true, noScroll: true });
	}

	function serializeActivity(): string {
		return JSON.stringify({ form, north, east, limitCapacity });
	}

	function serializeVisibility(): string {
		return JSON.stringify([...visibilityGroupIds].sort());
	}

	function serializeNotification(): string {
		return JSON.stringify({ notificationTarget, notificationKind, notificationDraft });
	}

	async function load(): Promise<void> {
		loading = true;
		error = null;
		try {
			const [me, groupTree, loadedUsers] = await Promise.all([
				getMe(),
				listGroupTree(),
				loadGroupUserOptions()
			]);
			groups = groupTree;
			userSuggestions = loadedUsers;
			adminGroupIds = me.admin_group_ids;
			if (id) {
				const [activity, activityTickets] = await Promise.all([
					getActivity(id),
					listActivityTicketKinds(id)
				]);
				const additionalHostIds = activity.hosts
					.map((host) => host.id)
					.filter((hostId) => hostId !== activity.creator_id);
				const mayEdit = me.admin_group_ids.some(
					(groupId) => groupId === activity.creator_id || additionalHostIds.includes(groupId)
				);
				const [pendingHosts, activityVerifiers] = mayEdit
					? await Promise.all([listPendingActivityHosts(id), listActivityVerifiers(id)])
					: [[], []];
				form = {
					responsible_name: activity.responsible.name,
					responsible_contact: activity.responsible.contact,
					creator_id: activity.creator_id,
					title: { ...activity.title },
					description: { ...activity.description },
					location: {
						name: { sv: '', en: '', ...activity.location.name },
						directions: { sv: '', en: '', ...activity.location.directions },
						url: activity.location.url ?? '',
						coordinate_wgs84: activity.location.coordinate_wgs84
					},
					time_start: activity.time_start,
					time_end: activity.time_end,
					image_id: activity.image_id,
					is_hidden: activity.is_hidden,
					is_hidden_for_other_admins: activity.is_hidden_for_other_admins,
					max_tickets: activity.max_tickets,
					host_ids: additionalHostIds
				};
				savedHostIds = additionalHostIds;
				pendingHostIds = pendingHosts.map((group) => group.id);
				verifiers = activityVerifiers;
				imageUrl = activity.image_url;
				contactKind = activity.responsible.contact.startsWith('tel:') ? 'tel' : 'mailto';
				limitCapacity = activity.max_tickets !== I32_MAX;
				north = activity.location.coordinate_wgs84?.north.toString() ?? '';
				east = activity.location.coordinate_wgs84?.east.toString() ?? '';
				tickets = activityTickets;
				const kinds = await Promise.all(activityTickets.map((ticket) => getTicketKind(ticket.id)));
				const notificationsByKind = mayEdit
					? await Promise.all(
							kinds.map(async (kind) => ({
								kind,
								notifications: await listNotifications(kind.ticket_kind_id)
							}))
						)
					: [];
				purchases = mayEdit
					? (
							await Promise.all(activityTickets.map((ticket) => listPurchasedTickets(ticket.id)))
						).flat()
					: [];
				detailedTicketKinds = kinds;
				visibilityGroupIds = [
					...new Set(
						kinds.filter((kind) => kind.max_tickets === 0).flatMap((kind) => kind.allowed_group_ids)
					)
				];
				scheduledNotifications = notificationsByKind.flatMap(({ kind, notifications }) =>
					notifications.map((notification) => ({
						...notification,
						ticketKindId: kind.ticket_kind_id,
						ticketName: localize(kind.ticket_kind_name)
					}))
				);
				minimumCapacity = kinds.reduce(
					(total, kind) => total + kind.reserved_or_purchased_tickets,
					0
				);
				reportCategoryOptions = [
					...new Set(
						kinds.flatMap((kind) =>
							kind.available_addons.flatMap((addon) =>
								addon.options.flatMap((option) => option.bookkeeping_price_categories)
							)
						)
					)
				];
			} else {
				form.responsible_name = me.name;
				form.responsible_contact = me.id.startsWith('email:')
					? `mailto:${me.id.slice('email:'.length)}`
					: '';
				form.creator_id = me.admin_group_ids[0] ?? '';
			}
			if (savedActivitySnapshot === '') savedActivitySnapshot = serializeActivity();
			if (savedVisibilitySnapshot === '') savedVisibilitySnapshot = serializeVisibility();
			if (savedNotificationSnapshot === '') savedNotificationSnapshot = serializeNotification();
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			loading = false;
		}
	}

	function updateContactKind(value: string | number): void {
		contactKind = value === 'tel' ? 'tel' : 'mailto';
		form.responsible_contact = `${contactKind}:${contactValue}`;
	}

	function updateContactValue(value: string): void {
		form.responsible_contact = `${contactKind}:${value.trim()}`;
	}

	function updateStart(value: string): void {
		const oldStart = new Date(form.time_start).getTime();
		const oldEnd = new Date(form.time_end).getTime();
		const nextStart = new Date(value).getTime();
		form.time_start = value;
		if (oldEnd <= nextStart) {
			form.time_end = new Date(nextStart + Math.max(oldEnd - oldStart, 3_600_000)).toISOString();
		}
	}

	function toggleCapacityLimit(enabled: boolean): void {
		limitCapacity = enabled;
		form.max_tickets = enabled ? Math.max(minimumCapacity, 0) : I32_MAX;
	}

	function issue(field: string, message: string): ValidationIssue {
		return { field, message };
	}

	function validate(): ValidationIssue | null {
		if (
			contactValue.trim() &&
			contactKind === 'mailto' &&
			!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactValue)
		)
			return issue(m.responsible_contact(), m.invalid_email());
		if (
			contactValue.trim() &&
			contactKind === 'tel' &&
			!/^\+?[0-9][0-9 ()-]{5,}$/.test(contactValue)
		)
			return issue(m.responsible_contact(), m.invalid_phone());
		if (!form.creator_id) return issue(m.creator(), m.required_fields());
		if (new Date(form.time_end) <= new Date(form.time_start))
			return issue(m.end(), m.end_after_start());
		if (
			limitCapacity &&
			(!Number.isInteger(form.max_tickets) || form.max_tickets < minimumCapacity)
		)
			return issue(m.activity_capacity(), m.capacity_too_low({ minimum: minimumCapacity }));
		if (!id && !adminGroupIds.includes(form.creator_id))
			return issue(m.creator(), m.admin_host_required());
		if ((north && !east) || (!north && east))
			return issue(`${m.latitude()} / ${m.longitude()}`, m.coordinates_together());
		if (north && parseCoordinate(north, 'north') === null)
			return issue(m.latitude(), m.invalid_coordinates());
		if (east && parseCoordinate(east, 'east') === null)
			return issue(m.longitude(), m.invalid_coordinates());
		if (form.location.url) {
			try {
				const url = new URL(form.location.url);
				if (!['http:', 'https:'].includes(url.protocol))
					return issue(m.location_url(), m.invalid_location_url());
			} catch {
				return issue(m.location_url(), m.invalid_location_url());
			}
		}
		return null;
	}

	function toggleHost(groupId: string, checked: boolean): void {
		if (!savedHostIds.includes(groupId) || !adminGroupIds.includes(groupId)) return;
		form.host_ids = checked
			? [...new SvelteSet([...form.host_ids, groupId])]
			: form.host_ids.filter((id) => id !== groupId);
	}

	async function inviteHost(groupId: string): Promise<void> {
		if (!id || savedHostIds.includes(groupId) || pendingHostIds.includes(groupId)) return;
		invitingHostId = groupId;
		error = null;
		try {
			await inviteActivityHost(id, groupId);
			pendingHostIds = [...new SvelteSet([...pendingHostIds, groupId])];
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			invitingHostId = null;
		}
	}

	async function changeVerifier(run: () => Promise<void>): Promise<void> {
		if (!id) return;
		error = null;
		try {
			await run();
			verifiers = await listActivityVerifiers(id);
		} catch (cause) {
			error = frontendError(cause);
		}
	}

	async function refreshNotifications(): Promise<void> {
		const notificationsByKind = await Promise.all(
			detailedTicketKinds.map(async (kind) => ({
				kind,
				notifications: await listNotifications(kind.ticket_kind_id)
			}))
		);
		scheduledNotifications = notificationsByKind.flatMap(({ kind, notifications }) =>
			notifications.map((notification) => ({
				...notification,
				ticketKindId: kind.ticket_kind_id,
				ticketName: localize(kind.ticket_kind_name, '').trim() || m.empty_ticket_kind()
			}))
		);
	}

	async function createNotification(): Promise<void> {
		if (!id || !canEdit || notificationSaving) return;
		if (
			!notificationKind.trim() ||
			!notificationDraft.title.sv.trim() ||
			!notificationDraft.title.en.trim() ||
			!notificationDraft.content.sv.trim() ||
			!notificationDraft.content.en.trim()
		) {
			error = `${m.notification_kind()}: ${m.required_fields()}`;
			toasts.show('error', error);
			return;
		}
		const targetIds =
			notificationTarget === '$all'
				? purchasableTickets.map((ticket) => ticket.id)
				: [notificationTarget];
		if (targetIds.length === 0) {
			error = `${m.notification_target()}: ${m.required_fields()}`;
			toasts.show('error', error);
			return;
		}
		notificationSaving = true;
		error = null;
		try {
			await Promise.all(
				targetIds.map((ticketKindId) =>
					saveNotification(ticketKindId, notificationKind.trim(), notificationDraft)
				)
			);
			await refreshNotifications();
			savedNotificationSnapshot = serializeNotification();
			toasts.show('success', m.backend_success());
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			notificationSaving = false;
		}
	}

	async function removeNotification(ticketKindId: string, kind: string): Promise<void> {
		if (!canEdit || !confirm(m.delete_notification_confirm())) return;
		const key = `${ticketKindId}-${kind}`;
		deletingNotificationKey = key;
		error = null;
		try {
			await deleteNotification(ticketKindId, kind);
			scheduledNotifications = scheduledNotifications.filter(
				(notification) => notification.ticketKindId !== ticketKindId || notification.kind !== kind
			);
			toasts.show('success', m.backend_success());
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			deletingNotificationKey = null;
		}
	}

	async function saveVisibilityAccess(): Promise<void> {
		if (!id || !canEdit) return;
		visibilitySaving = true;
		error = null;
		try {
			const accessKinds = detailedTicketKinds.filter((kind) => kind.max_tickets === 0);
			const assigned = new SvelteSet<string>();
			for (const kind of accessKinds) {
				const groupId = visibilityGroupIds.find((candidate) => !assigned.has(candidate));
				if (groupId) assigned.add(groupId);
				await saveTicketKind(kind.ticket_kind_id, {
					activity_id: id,
					name: { sv: 'null', en: 'null' },
					price: 0,
					purchasing_available_start: kind.purchasing_available_start,
					purchasing_available_stop: kind.purchasing_available_stop,
					max_tickets: 0,
					min_tickets: 0,
					allow_transfer_ticket_start: kind.allow_transfer_ticket_start,
					allow_transfer_ticket_stop: kind.allow_transfer_ticket_stop,
					allow_transfer_ticket_bypass_allowed_groups: false,
					allowed_group_ids: groupId ? [groupId] : [],
					addons: []
				});
			}
			for (const groupId of visibilityGroupIds.filter((candidate) => !assigned.has(candidate))) {
				const ticketId = crypto.randomUUID();
				const now = new Date().toISOString();
				await saveTicketKind(ticketId, {
					activity_id: id,
					name: { sv: 'null', en: 'null' },
					price: 0,
					purchasing_available_start: now,
					purchasing_available_stop: now,
					max_tickets: 0,
					min_tickets: 0,
					allow_transfer_ticket_start: now,
					allow_transfer_ticket_stop: now,
					allow_transfer_ticket_bypass_allowed_groups: false,
					allowed_group_ids: [groupId],
					addons: []
				});
			}
			toasts.show('success', m.backend_success());
			await load();
			savedVisibilitySnapshot = serializeVisibility();
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			visibilitySaving = false;
		}
	}

	async function chooseImage(event: Event): Promise<void> {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		uploading = true;
		error = null;
		try {
			form.image_id = await uploadImage(file);
			imageUrl = URL.createObjectURL(file);
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			uploading = false;
		}
	}

	async function persistActivity(isHidden: boolean): Promise<void> {
		if (!canEdit) return;
		const validationIssue = validate();
		if (validationIssue) {
			invalidField = validationIssue.field;
			if (
				validationIssue.field === m.location_url() ||
				validationIssue.field.includes(m.latitude()) ||
				validationIssue.field.includes(m.longitude())
			)
				changeEditorTab(1);
			else changeEditorTab(0);
			error = `${validationIssue.field}: ${validationIssue.message}`;
			toasts.show('error', error);
			return;
		}
		saving = true;
		error = null;
		invalidField = null;
		try {
			const activityId = id ?? crypto.randomUUID();
			if (!form.image_id) form.image_id = await uploadRandomColorImage();
			const keepsAdminAccess = adminGroupIds.some(
				(groupId) => groupId === form.creator_id || form.host_ids.includes(groupId)
			);
			const parsedNorth = parseCoordinate(north, 'north');
			const parsedEast = parseCoordinate(east, 'east');
			const coordinate =
				typeof parsedNorth === 'number' && typeof parsedEast === 'number'
					? { north: parsedNorth, east: parsedEast }
					: undefined;
			await saveActivity(activityId, {
				...form,
				is_hidden: isHidden,
				location: {
					...form.location,
					url: form.location.url || undefined,
					coordinate_wgs84: coordinate
				}
			});
			form.is_hidden = isHidden;
			savedActivitySnapshot = serializeActivity();
			if (!id) {
				allowNavigation = true;
				await goto(resolve('/activities/[id]', { id: activityId }), { replaceState: true });
			} else {
				savedHostIds = [...form.host_ids];
				if (!keepsAdminAccess) {
					allowNavigation = true;
					await goto(resolve('/'), { replaceState: true });
				}
			}
		} catch (cause) {
			allowNavigation = false;
			error = frontendError(cause);
		} finally {
			saving = false;
		}
	}

	function submit(event: SubmitEvent): void {
		event.preventDefault();
		void persistActivity(form.is_hidden);
	}

	function togglePublished(): void {
		void persistActivity(!form.is_hidden);
	}

	async function downloadReport(): Promise<void> {
		if (!id || !canEdit) return;
		if (
			![externalSaleFees ?? 0, ...externalSales.map((sale) => sale.total)].every(
				(value) => Number.isSafeInteger(value) && value >= 0
			) ||
			externalSales.some((sale) => !sale.alcohol_category.trim())
		) {
			reportError = m.external_report_values_invalid();
			toasts.show('error', reportError);
			return;
		}
		reporting = true;
		reportError = null;
		try {
			const request: ReportRequest = {
				external_sales: externalSales.map((sale) => ({
					alcohol_category: sale.alcohol_category,
					total: sale.total
				})),
				external_sale_fees: externalSaleFees ?? 0
			};
			const report = await downloadActivityReport(id, request);
			if (!(report instanceof Blob) || report.size === 0)
				throw new Error(m.report_download_failed());
			const url = URL.createObjectURL(report);
			const link = document.createElement('a');
			link.href = url;
			link.download = `activity-report-${id}.pdf`;
			document.body.append(link);
			link.click();
			link.remove();
			window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
			toasts.show('success', m.report_download_ready());
		} catch (cause) {
			reportError = cause instanceof Error ? cause.message : m.report_download_failed();
			frontendError(cause);
		} finally {
			reporting = false;
		}
	}

	function addExternalSale(): void {
		externalSales = [...externalSales, { alcohol_category: 'null', total: 0 }];
	}

	function updateExternalSale(index: number, update: Partial<ExternalSaleCategory>): void {
		externalSales[index] = { ...externalSales[index], ...update };
		reportError = null;
	}

	function removeExternalSale(index: number): void {
		externalSales = externalSales.filter((_, saleIndex) => saleIndex !== index);
	}

	async function duplicateActivity(): Promise<void> {
		if (!id || !canEdit) return;
		saving = true;
		error = null;
		try {
			const activityId = crypto.randomUUID();
			const copy = $state.snapshot(form);
			const sourceTicketKinds = await Promise.all(
				tickets.map((ticket) => getTicketKind(ticket.id))
			);
			await saveActivity(activityId, {
				...copy,
				is_hidden: true,
				title: copiedLocalizedTitle(copy.title)
			});
			const now = Date.now();
			await Promise.all(
				sourceTicketKinds
					.filter(
						(kind) =>
							!kind.has_been_released && new Date(kind.purchasing_available_start).getTime() > now
					)
					.map((kind) =>
						saveTicketKind(crypto.randomUUID(), {
							activity_id: activityId,
							name: { ...kind.ticket_kind_name },
							price: kind.price,
							purchasing_available_start: kind.purchasing_available_start,
							purchasing_available_stop: kind.purchasing_available_stop,
							max_tickets: kind.max_tickets,
							min_tickets: kind.min_tickets,
							allow_transfer_ticket_start: kind.allow_transfer_ticket_start,
							allow_transfer_ticket_stop: kind.allow_transfer_ticket_stop,
							allow_transfer_ticket_bypass_allowed_groups:
								kind.allow_transfer_ticket_bypass_allowed_groups,
							allowed_group_ids: [...kind.allowed_group_ids],
							addons: copyTicketAddons(kind.available_addons)
						})
					)
			);
			allowNavigation = true;
			await goto(resolve('/activities/[id]', { id: activityId }));
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
		<p class="eyebrow">{m.nav_activities()}</p>
		<h1>
			<span class="activity-title-status">
				<span
					>{isNew ? m.new_activity() : canEdit ? m.edit_activity() : m.activity_details()}{form
						.title.sv || form.title.en
						? ` · ${localize(form.title)}`
						: ''}</span>
				{#if form.is_hidden}<span class="pill hidden">{m.not_published()}</span>{/if}
			</span>
		</h1>
	</div>
	<div class="toolbar">
		{#if id && canEdit}
			<button
				class="button-link secondary"
				type="button"
				disabled={saving}
				onclick={() => void duplicateActivity()}>
				<Copy size={17} />
				{m.duplicate_activity()}
			</button>
		{/if}
		<a class="button-link secondary" href={resolve('/')}><ArrowLeft size={18} /> {m.back()}</a>
	</div>
</header>

{#if loading}
	<div class="center-stage">
		<div class="loader"></div>
		<p>{m.loading()}</p>
	</div>
{:else}
	<ActivityTabs
		labels={editorTabs}
		active={editorTab}
		accessibleLabel={m.edit_activity()}
		onchange={changeEditorTab} />
	<form class="stack" novalidate onsubmit={submit}>
		{#if error}<p class="error-banner" role="alert">{error}</p>{/if}
		{#if !canEdit}<p class="info-banner" role="status">{m.activity_read_only()}</p>{/if}
		<fieldset class="stack activity-editor-fields" disabled={!canEdit}>
			{#if editorTab === 0}<ActivityDetailsFields
					value={form}
					{groups}
					{adminGroupIds}
					creatorReadonly={!isNew}
					creatorName={localize(creatorGroup?.name, creatorGroup?.path ?? form.creator_id)}
					{contactKind}
					{contactValue}
					{imageUrl}
					{uploading}
					{invalidField}
					onchange={(value) => (form = value)}
					onstartchange={updateStart}
					oncontactkindchange={updateContactKind}
					oncontactvaluechange={updateContactValue}
					onimagechange={(event) => void chooseImage(event)} />
			{/if}

			{#if editorTab === 1}<ActivityLocationFields
					value={form.location}
					{north}
					{east}
					{invalidField}
					onchange={(location) => (form = { ...form, location })}
					onnorthchange={(value) => (north = value)}
					oneastchange={(value) => (east = value)} />

				<section class="card card-pad">
					<div>
						<div class="section-heading">
							<h2 class="section-title">{m.hosts()}</h2>
							<span class="pill">{m.hosts_selected({ count: form.host_ids.length })}</span>
						</div>
						<p class="muted host-help">
							{id ? m.hosts_invitation_help() : m.save_before_inviting_hosts()}
						</p>
						<GroupTreeExplorer
							{groups}
							revealIds={[form.creator_id, ...savedHostIds, ...pendingHostIds]}>
							{#snippet children(row)}
								{#if row.group.id === form.creator_id}
									<span class="host-tree-label">
										<GroupIcon
											url={row.group.logo_url}
											name={localize(row.group.name, row.group.path)} />
										{localize(row.group.name, row.group.path)}
										<span class="pill">{m.creator()}</span>
									</span>
								{:else}
									{#if savedHostIds.includes(row.group.id)}
										<label class="host-tree-check">
											<input
												type="checkbox"
												checked={form.host_ids.includes(row.group.id)}
												disabled={!adminGroupIds.includes(row.group.id)}
												onchange={(event) =>
													toggleHost(row.group.id, event.currentTarget.checked)} />
											<GroupIcon
												url={row.group.logo_url}
												name={localize(row.group.name, row.group.path)} />
											<span>{localize(row.group.name, row.group.path)}</span>
											{#if !adminGroupIds.includes(row.group.id)}
												<span class="pill">{m.host_remove_own_only()}</span>
											{/if}
										</label>
									{:else if pendingHostIds.includes(row.group.id)}
										<span class="host-tree-label">
											<GroupIcon
												url={row.group.logo_url}
												name={localize(row.group.name, row.group.path)} />
											{localize(row.group.name, row.group.path)}
											<span class="pill">{m.host_invite_pending()}</span>
										</span>
									{:else}
										<div class="host-tree-invite">
											<GroupIcon
												url={row.group.logo_url}
												name={localize(row.group.name, row.group.path)} />
											<span>{localize(row.group.name, row.group.path)}</span>
											{#if id}
												<button
													class="button-link secondary compact"
													type="button"
													disabled={invitingHostId === row.group.id}
													onclick={() => void inviteHost(row.group.id)}>
													<Send size={14} />
													{invitingHostId === row.group.id ? m.inviting_host() : m.invite_host()}
												</button>
											{/if}
										</div>
									{/if}
								{/if}
							{/snippet}
						</GroupTreeExplorer>
					</div>
				</section>
			{/if}

			{#if editorTab === 2 && id}
				<section class="card card-pad stack">
					<div>
						<h2 class="section-title">{m.visibility_access()}</h2>
						<p class="muted preserve-lines">{m.activities_details()}</p>
						<p class="muted">{m.visibility_access_help()}</p>
					</div>
					<GroupTreePicker
						title={m.visibility_access()}
						{groups}
						selectedIds={visibilityGroupIds}
						inheritDescendants
						disabled={!canEdit}
						onchange={(ids) => {
							visibilityGroupIds = ids;
						}} />
					{#if canEdit}<button
							class="button-link secondary"
							type="button"
							disabled={visibilitySaving}
							onclick={() => void saveVisibilityAccess()}>{m.save_visibility_access()}</button
						>{/if}
				</section>
				<section class="card card-pad">
					<div class="toolbar between">
						<h2 class="section-title">{m.tickets()}</h2>
						{#if canEdit}
							<a class="button-link" href={resolve(`/tickets/new/?activity=${id}` as Pathname)}
								><Plus size={17} /> {m.new_ticket()}</a>
						{/if}
					</div>
					{#if purchasableTickets.length === 0}<p class="empty-state">{m.empty()}</p>{:else}<ul
							class="list">
							{#each purchasableTickets as ticket (ticket.id)}<li>
									<div class="list-main">
										<strong>{localize(ticket.name, '').trim() || m.empty_ticket_kind()}</strong
										><span
											>{kronor(ticket.price)} · {dateTime(ticket.purchasing_available_start)}</span>
									</div>
									{#if canEdit}
										<a
											class="button-link secondary"
											href={resolve('/tickets/[id]', { id: ticket.id })}>{m.edit()}</a>
									{/if}
								</li>{/each}
						</ul>{/if}
				</section>
				<section class="card card-pad stack">
					<h2 class="section-title">{m.advanced()}</h2>
					<label class="switch-field">
						<Switch value={limitCapacity} onchange={({ value }) => toggleCapacityLimit(value)} />
						<span>{m.limit_max_tickets()}</span>
					</label>
					{#if limitCapacity}<label class="field"
							><span>{m.activity_capacity()}</span><small>{m.activity_capacity_help()}</small><input
								type="number"
								min={minimumCapacity}
								max={I32_MAX - 1}
								bind:value={form.max_tickets} /></label
						>{/if}
					<label class="switch-field" title={m.hide_other_admins_help()}
						><Switch
							value={form.is_hidden_for_other_admins}
							onchange={({ value }) => (form.is_hidden_for_other_admins = value)} /><span
							>{m.hide_other_admins()}</span
						></label>
				</section>
			{/if}

			{#if editorTab === 2 && id && canEdit}
				<section class="card card-pad stack">
					<p class="muted">{m.activity_verifiers_help()}</p>
					<UserList
						title={m.activity_verifiers()}
						items={verifiers}
						suggestions={userSuggestions}
						addLabel={m.verifier_user_id()}
						addText={m.grant_access()}
						removeText={m.revoke_access()}
						onadd={(userId) => changeVerifier(() => addActivityVerifier(id!, userId))}
						onremove={(userId) => changeVerifier(() => removeActivityVerifier(id!, userId))} />
				</section>
				<section class="card card-pad stack">
					<div>
						<h2 class="section-title">{m.addon_statistics()}</h2>
						<p class="muted">{m.addon_statistics_help()}</p>
					</div>
					<PurchaseGrid
						{purchases}
						kinds={detailedTicketKinds}
						users={userSuggestions}
						view="breakdown" />
				</section>

				<section class="card card-pad stack">
					<h2 class="section-title">
						{m.purchasers()} <span class="pill">{purchases.length}</span>
					</h2>
					<PurchaseGrid {purchases} kinds={detailedTicketKinds} users={userSuggestions} />
				</section>

				<section class="card card-pad stack">
					<h2 class="section-title">{m.memberships()}</h2>
					<PurchaseGrid
						{purchases}
						kinds={detailedTicketKinds}
						{groups}
						users={userSuggestions}
						view="memberships" />
				</section>
			{/if}

			{#if editorTab === 3 && id && canEdit}
				<section class="card card-pad stack">
					<div>
						<h2 class="section-title">{m.scheduled_notifications()}</h2>
						<p class="muted">{m.default_release_notifications()}</p>
						<p class="muted">{m.notification_recipients_help()}</p>
					</div>
					{#if scheduledNotifications.length === 0}<p class="empty-state">{m.empty()}</p>{:else}<ul
							class="list">
							{#each scheduledNotifications as notification (`${notification.ticketKindId}-${notification.kind}`)}<li>
									<div class="list-main">
										<strong>{localize(notification.title, notification.kind)}</strong><span
											>{notification.ticketName} · {notification.kind} · {dateTime(
												notification.send_at
											)}</span
										><span>{localize(notification.content)}</span>
									</div>
									<button
										class="icon-button danger-button"
										type="button"
										disabled={deletingNotificationKey ===
											`${notification.ticketKindId}-${notification.kind}`}
										aria-label={m.delete()}
										onclick={() =>
											void removeNotification(notification.ticketKindId, notification.kind)}>
										<Trash2 size={16} />
									</button>
								</li>{/each}
						</ul>{/if}
				</section>
				<section class="card card-pad stack">
					<div class="toolbar between">
						<h2 class="section-title">{m.add_notification()}</h2>
					</div>
					<label class="field notification-target-field">
						<span>{m.notification_target()}</span>
						<Select
							value={notificationTarget}
							options={[
								{ id: '$all', label: m.all_ticket_kinds() },
								...purchasableTickets.map((ticket) => ({
									id: ticket.id,
									label: localize(ticket.name, '').trim() || m.empty_ticket_kind()
								}))
							]}
							onchange={({ value }) => (notificationTarget = String(value))} />
					</label>
					<div class="grid-2">
						<NotificationFields
							kind={notificationKind}
							value={notificationDraft}
							onkindchange={(kind) => (notificationKind = kind)}
							onchange={(value) => (notificationDraft = value)} />
					</div>
					<div class="toolbar">
						<button
							class="button-link"
							type="button"
							disabled={notificationSaving || purchasableTickets.length === 0}
							onclick={() => void createNotification()}>
							<Plus size={16} />
							{notificationSaving ? m.saving() : m.save_notification()}
						</button>
					</div>
				</section>
			{/if}

			{#if editorTab === 2 && id && canEdit}
				<section class="card card-pad stack">
					<div>
						<h2 class="section-title">{m.sales_report()}</h2>
						<p class="muted">{m.external_sales_help()}</p>
					</div>
					<div class="report-fees-field">
						<MoneyInput
							label={m.external_sale_fees()}
							value={externalSaleFees}
							optional
							onchange={(value) => {
								externalSaleFees = value;
								reportError = null;
							}} />
					</div>
					<div class="toolbar between">
						<h3 class="section-title">
							{m.external_sales()} <span class="pill">{externalSales.length}</span>
						</h3>
						<button class="button-link secondary" type="button" onclick={addExternalSale}>
							<Plus size={16} />
							{m.add_external_sale()}
						</button>
					</div>
					{#if externalSales.length === 0}
						<p class="empty-state">{m.empty()}</p>
					{:else}
						<div class="stack">
							{#each externalSales as sale, index (index)}
								<div class="external-sale-row">
									<BookkeepingCategorySelect
										value={sale.alcohol_category}
										options={reportCategoryOptions}
										onchange={(alcohol_category) =>
											updateExternalSale(index, { alcohol_category })} />
									<MoneyInput
										label={m.external_sale_total()}
										value={sale.total}
										onchange={(value) =>
											updateExternalSale(index, {
												total: value ?? Number.NaN
											})} />
									<button
										class="icon-button danger-button"
										type="button"
										aria-label={m.remove()}
										onclick={() => removeExternalSale(index)}>
										<Trash2 size={17} />
									</button>
								</div>
							{/each}
						</div>
					{/if}
					{#if reportError}<p class="error-banner" role="alert">{reportError}</p>{/if}
					<div class="toolbar">
						<button
							class="button-link secondary"
							type="button"
							disabled={reporting}
							onclick={() => void downloadReport()}>
							<Download size={17} />
							{reporting ? m.downloading_report() : m.download_report()}
						</button>
					</div>
				</section>
			{/if}

			<div class="editor-action-dock">
				<button class="button-link" type="submit" disabled={saving || uploading}
					>{saving ? m.saving() : m.save()}</button>
				<button
					class="button-link secondary"
					type="button"
					disabled={saving || uploading}
					onclick={togglePublished}>
					{#if form.is_hidden}<Eye size={17} />{:else}<EyeOff size={17} />{/if}
					{form.is_hidden ? m.publish() : m.unpublish()}
				</button>
			</div>
		</fieldset>
	</form>
{/if}
