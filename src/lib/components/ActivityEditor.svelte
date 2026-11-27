<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { Pathname } from '$app/types';
	import {
		activityTabIndex,
		activityTabUrl,
		isActivityTabNavigation,
		type ActivityTab
	} from '$lib/activity-tabs';
	import {
		addActivityVerifier,
		deleteActivity,
		downloadActivityReport,
		getActivity,
		getVerifiedTicketHolderCount,
		getMe,
		inviteActivityHost,
		listActivityProducts,
		listGroupProducts,
		linkActivityItem,
		listGroupResales,
		saveProduct,
		listAddons,
		saveAddon,
		listGroupTree,
		listPendingActivityHosts,
		listPurchasedTickets,
		refundPurchase,
		createExternalUser,
		listActivityVerifiers,
		listTicketBuyers,
		inviteTicketBuyer,
		removeTicketBuyer,
		removeActivityVerifier,
		saveActivity
	} from '$lib/api/admin';
	import { frontendError } from '$lib/api/client';
	import type {
		AdminUser,
		ExternalSaleCategory,
		Group,
		PutActivity,
		AdminProduct,
		AdminResale,
		AvailableAddon,
		PurchasedTicket,
		ReportRequest,
		TicketBuyer
	} from '$lib/api/types';
	import { loadVisibleMemberOptions } from '$lib/visible-members';
	import ActivityDetailsFields from '$lib/components/ActivityDetailsFields.svelte';
	import ActivityLocationFields from '$lib/components/ActivityLocationFields.svelte';
	import SalesDevices from '$lib/components/SalesDevices.svelte';
	import ExportPdf from '$lib/components/ExportPdf.svelte';
	import ActivityTabs from '$lib/components/ActivityTabs.svelte';
	import BookkeepingCategorySelect from '$lib/components/BookkeepingCategorySelect.svelte';
	import GroupIcon from '$lib/components/GroupIcon.svelte';
	import GroupTreeExplorer from '$lib/components/GroupTreeExplorer.svelte';
	import GroupTreePicker from '$lib/components/GroupTreePicker.svelte';
	import MoneyInput from '$lib/components/MoneyInput.svelte';
	import PurchaseGrid from '$lib/components/PurchaseGrid.svelte';
	import UserList from '$lib/components/UserList.svelte';
	import { copiedLocalizedTitle, dateTime, kronor, localize, sortByLocalizedName } from '$lib/i18n';
	import { uploadImage, uploadRandomColorImage } from '$lib/image';
	import { cropActivityImage } from '$lib/crop-image';
	import * as m from '$lib/paraglide/messages';
	import { copyTicketAddon } from '$lib/ticket-presets';
	import { isVisibilityProduct, linkedAddons, productBody } from '$lib/product';
	import { defaultTransferGroups, sameGroups } from '$lib/transfer-settings';
	import { ArrowLeft, Copy, Download, Eye, EyeOff, Plus, Send, Trash2 } from '@lucide/svelte';
	import { Select, Switch } from '@svar-ui/svelte-core';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { toasts } from '$lib/toasts.svelte';
	import { parseCoordinate } from '$lib/coordinates';
	import { downloadTicketPurchasersCsv } from '$lib/purchase-csv';

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
	let imageUrl = $state('');
	let north = $state('');
	let east = $state('');
	let contactKind = $state<'mailto' | 'tel'>('mailto');
	let minimumCapacity = $state(0);
	let reportCategoryOptions = $state<string[]>([]);
	let externalSaleFees = $state<number | undefined>(undefined);
	let externalSales = $state<ExternalSaleCategory[]>([]);
	let savedHostIds = $state<string[]>([]);
	let pendingHostIds = $state<string[]>([]);
	let invitingHostId = $state<string | null>(null);
	let verifiers = $state<AdminUser[]>([]);
	let userSuggestions = $state<AdminUser[]>([]);
	let detailedTicketKinds = $state<AdminProduct[]>([]);
	let availableItems = $state<AdminProduct[]>([]);
	let linkingItemId = $state<string | null>(null);
	let baseTicketId = $state('');
	let owners = $state<PurchasedTicket[]>([]);
	let verifiedTicketHolders = $state(0);
	let editorTab = $derived(activityTabIndex(page.url));
	let visibilityGroupIds = $state<string[]>([]);
	let savingVisibility = $state(false);
	let activityAddons = $state<AvailableAddon[]>([]);
	const sortedAddons = $derived(sortByLocalizedName(activityAddons, (addon) => addon.name));
	let savingTransferSettings = $state(false);
	const baseProduct = $derived(
		detailedTicketKinds.find((kind) => kind.id === baseTicketId) ?? null
	);
	/** The base ticket only counts as a ticket once the placeholder product was turned into one. */
	const baseTicketProduct = $derived(baseProduct?.kind === 'ticket' ? baseProduct : null);
	let activityViews = $state(0);
	let resales = $state<AdminResale[]>([]);
	let savedActivitySnapshot = $state('');
	let allowNavigation = $state(false);
	const editorTabs = new Map<ActivityTab, string>([
		['details', m.creation_step_details()],
		['logistics', m.creation_step_logistics()],
		['tickets', m.creation_step_tickets()],
		['sales', m.creation_step_sales()],
		['products', m.nav_products()]
	]);
	let form = $state<PutActivity>({
		responsible_name: '',
		responsible_contact: '',
		sales_target_group_id: '',
		title: { sv: '', en: '' },
		description: { sv: '', en: '' },
		location: { name: { sv: '', en: '' }, directions: { sv: '', en: '' }, url: '' },
		time_start: new Date(Date.now() + 86_400_000).toISOString(),
		time_end: new Date(Date.now() + 90_000_000).toISOString(),
		image_id: '',
		is_hidden: true,
		is_hidden_for_other_admins: false,
		// One ticket per person by default (the server default too).
		max_tickets_per_user: 1,
		host_ids: []
	});
	const contactValue = $derived(form.responsible_contact.replace(/^(mailto:|tel:)/, ''));
	const creatorGroup = $derived(groups.find((group) => group.id === form.sales_target_group_id));
	const canEdit = $derived(
		isNew ||
			adminGroupIds.some(
				(groupId) => groupId === form.sales_target_group_id || savedHostIds.includes(groupId)
			)
	);
	const regularTicketKinds = $derived(
		sortByLocalizedName(
			detailedTicketKinds.filter((kind) => kind.kind === 'ticket'),
			(kind) => kind.name
		)
	);
	/** The base ticket gets its own card, so it must not be listed again among the extra kinds. */
	const extraTicketKinds = $derived(regularTicketKinds.filter((kind) => kind.id !== baseTicketId));
	const linkedItems = $derived(
		sortByLocalizedName(
			detailedTicketKinds.filter((product) => product.kind === 'normal'),
			(product) => product.name
		)
	);
	const unlinkedItems = $derived(
		sortByLocalizedName(
			availableItems.filter(
				(product) =>
					product.kind === 'normal' &&
					!detailedTicketKinds.some((linked) => linked.id === product.id)
			),
			(product) => product.name
		)
	);
	const ticketKindVisibilityGroupIds = $derived([
		...new Set(regularTicketKinds.flatMap((kind) => kind.allowed_group_ids))
	]);
	const purchaseKinds = $derived(
		detailedTicketKinds.map((product) => ({
			ticket_kind_id: product.id,
			ticket_kind_name: product.name,
			price: product.price,
			available_addons: linkedAddons(product, activityAddons)
		}))
	);
	const canDelete = $derived(
		Boolean(id && canEdit && form.is_hidden && regularTicketKinds.length === 0)
	);
	const productSalesGroups = $derived([
		...new Set(regularTicketKinds.map((product) => product.group_id))
	]);
	const hasMultipleSalesGroups = $derived(productSalesGroups.length > 1);
	const productSalesGroupLabels = $derived(
		productSalesGroups.map((id) => groups.find((group) => group.id === id)?.path ?? id)
	);
	// Extra kinds default to the base ticket's buyer groups (see `defaultTransferGroups`).
	const defaultTransferGroupIds = $derived(
		defaultTransferGroups(baseProduct?.allowed_group_ids ?? [])
	);
	const transferGroupsDefault = $derived(
		regularTicketKinds.every((kind) => sameGroups(kind.transfer_group_ids, defaultTransferGroupIds))
	);
	const TICKET_KIND_COLORS = ['#7fb98a', '#c9a86a', '#8aa9c0', '#c08a8a', '#a294c4', '#84c4b0'];
	const groupLabel = (groupId: string): string =>
		groups.find((group) => group.id === groupId)?.path ?? groupId;
	const groupLabelList = (groupIds: string[]): string =>
		groupIds.length ? groupIds.map(groupLabel).join(', ') : m.ticket_no_buyers();
	/** Tickets already sold per kind; refunded purchases free their unit again. */
	const soldTicketCounts = $derived.by(() => {
		const counts = new SvelteMap<string, number>();
		for (const owner of owners) {
			if (owner.refunded) continue;
			counts.set(owner.ticket_kind_id, (counts.get(owner.ticket_kind_id) ?? 0) + 1);
		}
		return counts;
	});
	const ticketCapacity = $derived(
		[baseTicketProduct, ...extraTicketKinds]
			.filter((kind): kind is AdminProduct => !!kind && kind.sales_stock !== undefined)
			.map((kind, index) => ({
				id: kind.id,
				name: localize(kind.name, '').trim() || kind.id,
				remaining: kind.sales_stock ?? 0,
				sold: soldTicketCounts.get(kind.id) ?? 0,
				base: kind.id === baseTicketProduct?.id,
				reservedFor: groupLabelList(kind.allowed_group_ids),
				color: TICKET_KIND_COLORS[index % TICKET_KIND_COLORS.length]
			}))
	);
	const ticketCapacityTracked = $derived(
		ticketCapacity.some((entry) => entry.remaining > 0 || entry.sold > 0) &&
			ticketCapacity.length === (baseTicketProduct ? 1 : 0) + extraTicketKinds.length
	);
	const ticketCapacityTotal = $derived(
		ticketCapacity.reduce((sum, entry) => sum + entry.remaining + entry.sold, 0)
	);
	const hasUnsavedChanges = $derived(
		savedActivitySnapshot !== '' && serializeActivity() !== savedActivitySnapshot
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

	function changeEditorTab(tab: ActivityTab): void {
		if (tab === editorTab) return;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- helper keeps the current resolved route and changes only its tab query
		void goto(activityTabUrl(page.url, tab), { keepFocus: true, noScroll: true });
	}

	function serializeActivity(): string {
		return JSON.stringify({
			form,
			north,
			east
		});
	}

	async function linkItem(productId: string): Promise<void> {
		if (!id) return;
		linkingItemId = productId;
		try {
			await linkActivityItem(id, productId);
			detailedTicketKinds = await listActivityProducts(id);
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			linkingItemId = null;
		}
	}

	async function load(): Promise<void> {
		loading = true;
		error = null;
		try {
			const [me, groupTree, loadedUsers] = await Promise.all([
				getMe(),
				listGroupTree(),
				loadVisibleMemberOptions()
			]);
			groups = groupTree;
			userSuggestions = loadedUsers;
			adminGroupIds = me.admin_group_ids;
			if (id) {
				const [activity, kinds] = await Promise.all([getActivity(id), listActivityProducts(id)]);
				const additionalHostIds = activity.hosts
					.map((host) => host.id)
					.filter((hostId) => hostId !== activity.sales_target_group_id);
				const mayEdit = me.admin_group_ids.some(
					(groupId) =>
						groupId === activity.sales_target_group_id || additionalHostIds.includes(groupId)
				);
				const [pendingHosts, activityVerifiers, verifiedHolders] = mayEdit
					? await Promise.all([
							listPendingActivityHosts(id),
							listActivityVerifiers(id),
							getVerifiedTicketHolderCount(id)
						])
					: [[], [], 0];
				form = {
					responsible_name: activity.responsible.name,
					responsible_contact: activity.responsible.contact,
					sales_target_group_id: activity.sales_target_group_id,
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
					max_tickets_per_user: activity.max_tickets,
					stock_group_id: activity.stock_group_id,
					host_ids: additionalHostIds
				};
				savedHostIds = additionalHostIds;
				pendingHostIds = pendingHosts.map((group) => group.id);
				verifiers = activityVerifiers;
				verifiedTicketHolders = verifiedHolders;
				imageUrl = activity.image_url;
				contactKind = activity.responsible.contact.startsWith('tel:') ? 'tel' : 'mailto';
				activityViews = activity.views;
				baseTicketId = activity.base_ticket ?? '';
				north = activity.location.coordinate_wgs84?.north.toString() ?? '';
				east = activity.location.coordinate_wgs84?.east.toString() ?? '';
				if (mayEdit) {
					resales = (await listGroupResales(activity.sales_target_group_id)).filter(
						(resale) => resale.activity_id === id
					);
				}
				owners = mayEdit
					? (
							await Promise.all(
								kinds
									.filter((product) => product.kind === 'ticket')
									.map((product) => listPurchasedTickets(product.id))
							)
						).flat()
					: [];
				detailedTicketKinds = kinds;
				availableItems = mayEdit
					? (
							await Promise.all(me.admin_group_ids.map((groupId) => listGroupProducts(groupId)))
						).flat()
					: [];
				activityAddons = await listAddons({ activityId: id });
				visibilityGroupIds = [
					...new Set(
						kinds.find((kind) => kind.id === (activity.base_ticket ?? ''))?.allowed_group_ids ?? []
					)
				];
				minimumCapacity = 0;
				reportCategoryOptions = [
					...new Set(
						activityAddons.flatMap((addon) =>
							addon.options.flatMap((option) => option.bookkeeping_price_categories)
						)
					)
				];
			} else {
				form.responsible_name = me.name;
				form.responsible_contact = me.id.startsWith('email:')
					? `mailto:${me.id.slice('email:'.length)}`
					: '';
				form.sales_target_group_id = me.admin_group_ids[0] ?? '';
			}
			if (savedActivitySnapshot === '') savedActivitySnapshot = serializeActivity();
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

	const capacityOptions = $derived([
		{ id: 'none', label: m.per_user_limit_none() },
		{ id: 'one', label: m.per_user_limit_one() },
		{ id: 'multiple', label: m.per_user_limit_multiple() }
	]);
	const capacityPreset = $derived(
		form.max_tickets_per_user >= I32_MAX
			? 'none'
			: form.max_tickets_per_user === 1
				? 'one'
				: 'multiple'
	);

	function setCapacityPreset(preset: string): void {
		if (preset === 'none') form.max_tickets_per_user = I32_MAX;
		else if (preset === 'one') form.max_tickets_per_user = 1;
		else if (form.max_tickets_per_user < 2 || form.max_tickets_per_user >= I32_MAX)
			form.max_tickets_per_user = Math.max(minimumCapacity, 2);
	}

	function issue(field: string, message: string): ValidationIssue {
		return { field, message };
	}

	function validate(isHidden: boolean): ValidationIssue | null {
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
		if (!form.sales_target_group_id) return issue(m.creator(), m.required_fields());
		if (new Date(form.time_end) <= new Date(form.time_start))
			return issue(m.end(), m.end_after_start());
		if (
			capacityPreset !== 'none' &&
			(!Number.isInteger(form.max_tickets_per_user) || form.max_tickets_per_user < minimumCapacity)
		)
			return issue(m.per_user_limit(), m.capacity_too_low({ minimum: minimumCapacity }));
		if (!id && !adminGroupIds.includes(form.sales_target_group_id))
			return issue(m.creator(), m.admin_host_required());
		if (!isHidden && visibilityGroupIds.length === 0)
			return issue(m.visibility_access(), m.activity_visibility_required());
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

	async function refundActivityPurchase(purchaseId: string, message?: string): Promise<void> {
		error = null;
		try {
			await refundPurchase(purchaseId, message);
			owners = (
				await Promise.all(
					detailedTicketKinds
						.filter((product) => !isVisibilityProduct(product))
						.map((product) => listPurchasedTickets(product.id))
				)
			).flat();
		} catch (cause) {
			error = frontendError(cause);
		}
	}

	/** Runs one admin write, then reloads the list it changed. */
	async function runAndReload(
		run: () => Promise<void>,
		reload: () => Promise<void>
	): Promise<void> {
		if (!id) return;
		error = null;
		try {
			await run();
			await reload();
		} catch (cause) {
			error = frontendError(cause);
		}
	}

	async function changeVerifier(run: () => Promise<void>): Promise<void> {
		await runAndReload(run, async () => {
			verifiers = await listActivityVerifiers(id!);
		});
	}

	let inviteKindId = $state('');
	let ticketBuyers = $state<TicketBuyer[]>([]);
	const inviteKind = $derived(regularTicketKinds.find((kind) => kind.id === inviteKindId));

	async function loadTicketBuyers(productId: string): Promise<void> {
		if (!id || !productId) return;
		ticketBuyers = await listTicketBuyers(id, productId);
	}

	function changeInvites(run: () => Promise<void>): Promise<void> {
		return runAndReload(run, () => loadTicketBuyers(inviteKindId));
	}

	let externalName = $state('');

	/** Creates an anonymous person in the activity's sales group and invites them to the kind. */
	async function inviteAnonymous(): Promise<void> {
		const kind = inviteKind;
		if (!id || !kind || !externalName.trim()) return;
		await changeInvites(async () => {
			const created = await createExternalUser({
				name: externalName.trim(),
				group_ids: [form.sales_target_group_id]
			});
			await inviteTicketBuyer(id!, kind.id, created.user_id);
			externalName = '';
		});
	}

	async function releaseAllocatedTickets(): Promise<void> {
		if (!id || !canEdit || saving) return;
		const base = baseTicketProduct;
		if (!base) {
			error = m.error_title();
			return;
		}
		const tickets = regularTicketKinds.filter(
			(product) => product.kind === 'ticket' && product.id !== base.id
		);
		const freed = tickets.reduce((sum, product) => sum + (product.sales_stock ?? 0), 0);
		saving = true;
		error = null;
		try {
			for (const product of tickets) {
				if (product.sales_stock === 0) continue;
				await saveProduct(
					product.id,
					{
						...productBody(product, linkedAddons(product, activityAddons)),
						sales_stock: 0
					},
					{ notify: false }
				);
			}
			await saveProduct(
				base.id,
				{
					...productBody(base, linkedAddons(base, activityAddons)),
					sales_stock: (base.sales_stock ?? 0) + freed
				},
				{ notify: false }
			);
			detailedTicketKinds = await listActivityProducts(id);
			toasts.show('success', m.backend_success());
			if (confirm(m.release_allocated_confirm())) changeEditorTab('tickets');
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			saving = false;
		}
	}

	async function persistVisibilityGroups(selectedIds: string[]): Promise<void> {
		if (!id || !canEdit || savingVisibility) return;
		const lockedIds = new Set(ticketKindVisibilityGroupIds);
		const editableIds = selectedIds.filter((groupId) => !lockedIds.has(groupId));
		// Visibility lives on the activity's base product even before it is turned into a ticket.
		const primary = baseProduct;
		savingVisibility = true;
		error = null;
		try {
			if (!primary) {
				error = m.error_title();
				return;
			}
			await saveProduct(
				primary.id,
				{
					...productBody(primary, linkedAddons(primary, activityAddons)),
					allowed_group_ids: editableIds
				},
				{ notify: false }
			);
			primary.allowed_group_ids = editableIds;
			visibilityGroupIds = [...new Set([...ticketKindVisibilityGroupIds, ...editableIds])];
			toasts.show('success', m.backend_success());
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			savingVisibility = false;
		}
	}

	async function persistTransferSettings(): Promise<void> {
		if (!canEdit || regularTicketKinds.length === 0) return;
		savingTransferSettings = true;
		error = null;
		try {
			for (const kind of regularTicketKinds) {
				const transfer_group_ids = defaultTransferGroupIds;
				if (sameGroups(kind.transfer_group_ids, transfer_group_ids)) continue;
				await saveProduct(
					kind.id,
					{
						...productBody(kind, linkedAddons(kind, activityAddons)),
						transfer_group_ids
					},
					{ notify: false }
				);
				kind.transfer_group_ids = transfer_group_ids;
			}
			toasts.show('success', m.backend_success());
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			savingTransferSettings = false;
		}
	}

	async function chooseImage(event: Event): Promise<void> {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		uploading = true;
		error = null;
		try {
			const cropped = await cropActivityImage(file);
			if (!cropped) return;
			form.image_id = await uploadImage(cropped);
			imageUrl = URL.createObjectURL(cropped);
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			uploading = false;
		}
	}

	async function persistActivity(isHidden: boolean): Promise<void> {
		if (!canEdit) return;
		const validationIssue = validate(isHidden);
		if (validationIssue) {
			invalidField = validationIssue.field;
			if (validationIssue.field === m.visibility_access() || validationIssue.field === m.addons())
				changeEditorTab('tickets');
			else if (
				validationIssue.field === m.location_url() ||
				validationIssue.field.includes(m.latitude()) ||
				validationIssue.field.includes(m.longitude())
			)
				changeEditorTab('logistics');
			else changeEditorTab('details');
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
				(groupId) => groupId === form.sales_target_group_id || form.host_ids.includes(groupId)
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
			const sourceTicketKinds = await listActivityProducts(id);
			await saveActivity(activityId, {
				...copy,
				is_hidden: true,
				title: copiedLocalizedTitle(copy.title)
			});
			const addonCopies = new SvelteMap<string, AvailableAddon>();
			for (const addon of await listAddons({ activityId: id })) {
				const cloned = copyTicketAddon(addon);
				await saveAddon({ activityId }, cloned);
				addonCopies.set(addon.id, cloned);
			}
			const now = Date.now();
			const delayedRelease = new Date(now + 86_400_000).toISOString();
			await Promise.all(
				sourceTicketKinds
					.filter((kind) => !isVisibilityProduct(kind))
					.map((kind) => {
						const releaseHasPassed =
							kind.tickets_been_released || new Date(kind.sales_start).getTime() <= now;
						const release = releaseHasPassed ? delayedRelease : kind.sales_start;
						return saveProduct(
							crypto.randomUUID(),
							{
								...productBody(
									kind,
									linkedAddons(kind, activityAddons).map((addon) => addonCopies.get(addon.id)!)
								),
								sales_start: release,
								sales_stop: kind.sales_stop,
								resale_start: kind.resale_start === kind.sales_start ? release : kind.resale_start,
								activity_ids: [activityId]
							},
							{ notify: false }
						);
					})
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

	async function removeActivity(): Promise<void> {
		if (!id || !canDelete || !confirm(m.delete_activity_confirm())) return;
		saving = true;
		error = null;
		try {
			await deleteActivity(id);
			allowNavigation = true;
			await goto(resolve('/'), { replaceState: true });
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
		<p class="eyebrow">{m.nav_activities()} · {m.views({ count: activityViews })}</p>
		<h1>
			<span class="activity-title-status">
				<span
					>{isNew ? m.new_activity() : canEdit ? m.edit_activity() : m.activity_details()}{form
						.title.sv || form.title.en
						? ` · ${localize(form.title)}`
						: ''}</span>
				{#if form.is_hidden}<span class="pill hidden">{m.unpublished()}</span>{/if}
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
			<button
				class="button-link secondary danger-button"
				type="button"
				disabled={saving || !canDelete}
				title={canDelete ? undefined : m.delete_activity_unavailable()}
				onclick={() => void removeActivity()}>
				<Trash2 size={17} />
				{m.delete_activity()}
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
			{#if editorTab === 'details'}<ActivityDetailsFields
					value={form}
					{groups}
					{adminGroupIds}
					creatorReadonly={!isNew}
					creatorName={localize(
						creatorGroup?.name,
						creatorGroup?.path ?? form.sales_target_group_id
					)}
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

			{#if editorTab === 'logistics'}<ActivityLocationFields
					value={form.location}
					{north}
					{east}
					{invalidField}
					onchange={(location) => (form = { ...form, location })}
					onnorthchange={(value) => (north = value)}
					oneastchange={(value) => (east = value)} />

				<section class="card card-pad stack">
					<div>
						<h2 class="section-title">{m.stock_group()}</h2>
						<p class="muted">{m.stock_group_help()}</p>
					</div>
					<GroupTreePicker
						{groups}
						selectedIds={form.stock_group_id ? [form.stock_group_id] : []}
						onchange={(ids) => {
							form.stock_group_id = ids.at(-1);
						}} />
				</section>

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
							revealIds={[form.sales_target_group_id, ...savedHostIds, ...pendingHostIds]}>
							{#snippet children(row)}
								{#if row.group.id === form.sales_target_group_id}
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
											<span class="flex items-center gap-2">
												<GroupIcon
													url={row.group.logo_url}
													name={localize(row.group.name, row.group.path)} />
												<span>{localize(row.group.name, row.group.path)}</span>
											</span>
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

			{#if editorTab === 'tickets' && id}
				{#if hasMultipleSalesGroups}
					<p class="info-banner" role="status">
						{m.multiple_sales_groups_warning({ groups: productSalesGroupLabels.join(', ') })}
					</p>
				{/if}
				<section class="card card-pad stack">
					<div class="section-heading">
						<h2 class="section-title">{m.base_ticket()}</h2>
						{#if baseTicketProduct}<span class="pill">{m.ticket_base_required()}</span>{/if}
					</div>
					<p class="muted">{m.ticket_base_help()}</p>
					{#if baseTicketProduct}
						<div class="ticket-summary">
							<div class="list-main">
								<strong>{localize(baseTicketProduct.name, '').trim() || m.empty_product()}</strong>
								<span
									>{kronor(baseTicketProduct.price)} · {baseTicketProduct.sales_stock ??
										'∞'}{m.number_of()} · {dateTime(baseTicketProduct.sales_start)}</span>
								<span class="muted"
									>{m.ticket_available_to({
										groups: groupLabelList(baseTicketProduct.allowed_group_ids)
									})}</span>
							</div>
							{#if canEdit}
								<a
									class="button-link secondary"
									href={resolve('/products/[id]', { id: baseTicketProduct.id })}>{m.edit()}</a>
							{/if}
						</div>
						{#if ticketCapacityTracked}
							<div class="stack">
								<h3 class="section-title">{m.ticket_capacity()}</h3>
								<div class="capacity-bar" role="img" aria-label={m.ticket_capacity()}>
									{#each ticketCapacity as entry (entry.id)}
										{#if entry.sold > 0}
											<span
												class="capacity-segment capacity-sold"
												style:background={entry.color}
												style:width="{((entry.sold / ticketCapacityTotal) * 100).toFixed(2)}%"
											></span>
										{/if}
										{#if entry.remaining > 0}
											<span
												class="capacity-segment"
												style:background={entry.color}
												style:width="{((entry.remaining / ticketCapacityTotal) * 100).toFixed(2)}%"
											></span>
										{/if}
									{/each}
								</div>
								<ul class="capacity-legend">
									{#each ticketCapacity as entry (entry.id)}
										<li>
											<span class="capacity-swatch" style:background={entry.color}></span>
											<span>{entry.base ? m.base_ticket() : entry.name}</span>
											<span class="pill"
												>{m.ticket_capacity_left({
													left: entry.remaining,
													total: entry.remaining + entry.sold
												})}</span>
											<span class="muted">{m.ticket_sold_count({ count: entry.sold })}</span>
											{#if !entry.base}
												<span class="muted"
													>{m.ticket_reserved_for({ groups: entry.reservedFor })}</span>
											{/if}
										</li>
									{/each}
								</ul>
								<p class="muted">{m.ticket_capacity_total({ count: ticketCapacityTotal })}</p>
							</div>
						{:else}
							<p class="muted">{m.ticket_capacity_untracked()}</p>
						{/if}
					{:else if baseProduct && canEdit}
						{@const addTicketsUrl = `${resolve('/products/[id]', { id: baseProduct.id })}?ticket=1&activity=${id}`}
						<p class="muted">{m.ticket_add_help()}</p>
						<div class="toolbar">
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the route is resolved, the query is appended -->
							<a class="button-link" href={addTicketsUrl}>
								<Plus size={17} />
								{m.ticket_add()}
							</a>
						</div>
					{:else}
						<p class="info-banner" role="status">{m.ticket_base_missing()}</p>
					{/if}
				</section>
				<section class="card card-pad stack">
					<div class="section-heading">
						<h2 class="section-title">{m.tickets()}</h2>
						<div class="toolbar">
							{#if canEdit}
								<button
									class="button-link secondary"
									type="button"
									disabled={saving || extraTicketKinds.length === 0}
									onclick={() => void releaseAllocatedTickets()}>{m.release_allocated()}</button>
								<a class="button-link" href={resolve(`/products/new/?activity=${id}` as Pathname)}
									><Plus size={17} /> {m.new_ticket()}</a>
							{/if}
						</div>
					</div>
					<p class="muted">{m.ticket_other_kinds_help()}</p>
					{#if extraTicketKinds.length === 0}<p class="empty-state">
							{m.empty()}
						</p>{:else}<ul class="list">
							{#each extraTicketKinds as product (product.id)}<li>
									<div class="list-main">
										<strong>{localize(product.name, '').trim() || m.empty_product()}</strong><span
											>{kronor(product.price)} · {product.sales_stock ?? '∞'}{m.number_of()} · {dateTime(
												product.sales_start
											)}</span>
										<span class="muted"
											>{m.ticket_reserved_for({
												groups: groupLabelList(product.allowed_group_ids)
											})}</span>
									</div>
									{#if canEdit}
										<a
											class="button-link secondary"
											href={resolve('/products/[id]', { id: product.id })}>{m.edit()}</a>
									{/if}
								</li>{/each}
						</ul>{/if}
				</section>
				{#if canEdit && regularTicketKinds.length > 0}
					<section class="card card-pad stack">
						<h2 class="section-title">{m.ticket_invites()}</h2>
						<p class="muted">{m.ticket_invites_help()}</p>
						<label class="field">
							<span>{m.ticket_invites_kind()}</span>
							<select
								bind:value={inviteKindId}
								onchange={() => void loadTicketBuyers(inviteKindId)}>
								<option value="">{m.choose()}</option>
								{#each regularTicketKinds as product (product.id)}
									<option value={product.id}>{localize(product.name, '').trim()}</option>
								{/each}
							</select>
						</label>
						{#if inviteKind}
							<div class="stack">
								<p class="muted">{m.ticket_invites_external_help()}</p>
								<div class="grid-2">
									<label class="field"
										><span>{m.external_user_name()}</span>
										<input type="text" bind:value={externalName} /></label>
									<div>
										<button
											class="button-link"
											type="button"
											disabled={!externalName.trim()}
											onclick={() => void inviteAnonymous()}>
											{m.ticket_invites_external()}
										</button>
									</div>
								</div>
							</div>
							<UserList
								title={m.ticket_invites()}
								items={ticketBuyers.map((buyer) => ({
									user_id: buyer.user_id,
									name: buyer.name ?? undefined
								}))}
								suggestions={userSuggestions.filter(
									(user) => !user.user_id.startsWith('email:') && !user.user_id.startsWith('api:')
								)}
								addLabel={m.verifier_user_id()}
								addText={m.add()}
								removeText={m.remove()}
								onadd={(userId) =>
									changeInvites(() => inviteTicketBuyer(id!, inviteKind.id, userId))}
								onremove={(userId) =>
									changeInvites(() => removeTicketBuyer(id!, inviteKind.id, userId))} />
						{:else}
							<p class="muted">{m.ticket_invites_none()}</p>
						{/if}
					</section>
				{/if}
				<section class="card card-pad">
					<div class="section-heading">
						<h2 class="section-title">{m.addons()}</h2>
						{#if canEdit}<a class="button-link" href={resolve(`/addons/new?activity=${id}`)}
								><Plus size={17} /> {m.new_addon()}</a
							>{/if}
					</div>
					<ul class="list">
						{#each sortedAddons as addon (addon.id)}
							{@const prices = addon.options.map((option) => option.price)}
							{@const minPrice = prices.length ? Math.min(...prices) : 0}
							{@const maxPrice = prices.length ? Math.max(...prices) : 0}
							<li>
								<div class="list-main">
									<strong>{localize(addon.name, '').trim() || m.empty_addon()}</strong>
									<span
										>{m.addon_applied_ticket_kinds({
											count: regularTicketKinds.filter((kind) =>
												linkedAddons(kind, activityAddons).some((item) => item.id === addon.id)
											).length
										})} · {m.addon_alternative_count({ count: addon.options.length })} · {minPrice ===
										maxPrice
											? kronor(minPrice)
											: `${kronor(minPrice)}–${kronor(maxPrice)}`}</span>
								</div>
								{#if canEdit}<a
										class="button-link secondary"
										href={resolve(`/addons/[id]?activity=${id}`, { id: addon.id })}>{m.edit()}</a
									>{/if}
							</li>
						{:else}<li class="empty-state">{m.empty()}</li>{/each}
					</ul>
				</section>
				<section class="card card-pad stack">
					<h2 class="section-title">{m.visibility_access()}</h2>
					{#if baseTicketProduct}
						{@const baseTicketUrl = `${resolve('/products/[id]', { id: baseTicketProduct.id })}?activity=${id}`}
						<p class="muted">{m.visibility_access_base_ticket_help()}</p>
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the route is resolved, the query is appended -->
						<a class="button-link secondary" href={baseTicketUrl}>{m.edit()}</a>
					{:else}
						<p class="muted">{m.visibility_access_help()}</p>
						<GroupTreePicker
							{groups}
							selectedIds={visibilityGroupIds}
							disabledIds={ticketKindVisibilityGroupIds}
							inheritDescendants
							disabled={savingVisibility}
							disabledTitle={m.visibility_access_from_ticket_kind()}
							onchange={persistVisibilityGroups} />
					{/if}
				</section>
				{#if regularTicketKinds.length > 0}
					<section class="card card-pad stack">
						<h2 class="section-title">{m.transfer_groups()}</h2>
						<p class="muted">{m.transfer_defaults_explanation()}</p>
						{#if transferGroupsDefault}
							<p>{m.transfer_groups_using_defaults()}</p>
						{:else}
							<p>{m.transfer_groups_custom_activity()}</p>
							{#if canEdit}<button
									class="button-link secondary"
									type="button"
									disabled={savingTransferSettings}
									onclick={() => void persistTransferSettings()}>
									{m.reset_transfer_groups()}
								</button>{/if}
						{/if}
					</section>
				{/if}
				<section class="card card-pad stack">
					<h2 class="section-title">{m.advanced()}</h2>
					<label class="field"
						><span>{m.per_user_limit()}</span><small>{m.per_user_limit_help()}</small>
						<Select
							value={capacityPreset}
							options={capacityOptions}
							onchange={({ value }) => setCapacityPreset(String(value))} /></label>
					{#if capacityPreset === 'multiple'}<label class="field"
							><span>{m.per_user_limit_count()}</span><input
								type="number"
								min="2"
								max={I32_MAX - 1}
								bind:value={form.max_tickets_per_user} /></label
						>{/if}
					<label class="switch-field" title={m.hide_other_admins_help()}
						><Switch
							value={form.is_hidden_for_other_admins}
							onchange={({ value }) => (form.is_hidden_for_other_admins = value)} /><span
							>{m.hide_other_admins()}</span
						></label>
				</section>
			{/if}

			{#if editorTab === 'products' && id}
				<section class="card card-pad stack">
					<h2 class="section-title">{m.activity_linked_items()}</h2>
					<ul class="list">
						{#each linkedItems as product (product.id)}
							<li>
								<div class="list-main">
									<strong>{localize(product.name, '')}</strong><span>{kronor(product.price)}</span>
								</div>
								<a
									class="button-link secondary"
									href={resolve('/products/[id]', { id: product.id })}>{m.edit()}</a>
							</li>
						{:else}<li class="empty-state">{m.empty()}</li>{/each}
					</ul>
				</section>
				{#if canEdit && form.stock_group_id}
					<section class="card card-pad stack">
						<h2 class="section-title">{m.activity_take_out_stock()}</h2>
						<p class="muted">{m.activity_take_out_stock_help()}</p>
						<a
							class="button-link"
							href="{resolve('/stock/[groupId]/movements/new', {
								groupId: form.stock_group_id
							})}?activity={id}">{m.activity_take_out_stock()}</a>
					</section>
				{/if}
				{#if canEdit}
					<section class="card card-pad stack">
						<h2 class="section-title">{m.activity_add_items()}</h2>
						<ul class="list">
							{#each unlinkedItems as product (product.id)}
								<li>
									<div class="list-main">
										<strong>{localize(product.name, '')}</strong><span
											>{groups.find((group) => group.id === product.group_id)?.path ??
												product.group_id}</span>
									</div>
									<button
										class="button-link secondary"
										type="button"
										disabled={linkingItemId !== null}
										onclick={() => void linkItem(product.id)}>{m.activity_add_item()}</button>
								</li>
							{:else}<li class="empty-state">{m.empty()}</li>{/each}
						</ul>
					</section>
				{/if}
			{/if}

			{#if editorTab === 'sales' && id && canEdit}
				<SalesDevices activityId={id} activityEnd={form.time_end} canEdit />
				<section class="card card-pad stack">
					<h2 class="section-title">{m.sales()}</h2>
					<p class="muted">{m.sales_export_help()}</p>
					<ExportPdf
						kind="sales"
						groupId={form.sales_target_group_id}
						activityId={id}
						fileName={`sales-activity-${id}.pdf`} />
				</section>
				<section class="card card-pad stack">
					<div>
						<h2 class="section-title">{m.resale_offers()}</h2>
						<p class="muted">{m.resale_offers_help()}</p>
					</div>
					{#if resales.length === 0}
						<p class="empty-state">{m.empty()}</p>
					{:else}
						<ul class="list">
							{#each resales as resale (resale.purchase_id)}
								<li>
									<div class="list-main">
										<strong>{localize(resale.product_name, '')}</strong>
										<span>{resale.owner_name || resale.owner_id} · {kronor(resale.price)}</span>
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
				<section class="card card-pad stack">
					<p class="muted">{m.activity_verifiers_help()}</p>
					<UserList
						title={m.activity_verifiers()}
						items={verifiers}
						suggestions={userSuggestions.filter((user) => !user.user_id.startsWith('email:'))}
						allowLuId
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
					<PurchaseGrid purchases={owners} kinds={purchaseKinds} view="breakdown" />
				</section>

				<section class="card card-pad stack">
					<div class="purchase-section-heading">
						<div class="purchase-counts">
							<h2 class="section-title">
								{m.ticket_holders()} <span class="pill">{owners.length}</span>
							</h2>
							<span class="muted">
								{m.verified_ticket_holders()}
								<span class="pill">{verifiedTicketHolders}</span>
							</span>
						</div>
						{#if owners.length > 0}
							<button
								class="button-link secondary compact"
								type="button"
								aria-label={m.export_all_ticket_purchasers()}
								title={m.export_all_ticket_purchasers()}
								onclick={() => downloadTicketPurchasersCsv(owners, purchaseKinds, userSuggestions)}>
								<Download size={16} />
							</button>
						{/if}
					</div>
					<PurchaseGrid
						purchases={owners}
						kinds={purchaseKinds}
						onRefund={refundActivityPurchase} />
				</section>

				<section class="card card-pad stack">
					<h2 class="section-title">{m.memberships()}</h2>
					<PurchaseGrid purchases={owners} kinds={purchaseKinds} {groups} view="memberships" />
				</section>

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
					<div class="section-heading">
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

<style>
	.ticket-summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 15px;
		padding: 14px;
		border: 1px solid #303531;
		border-radius: 9px;
		background: #1a1d1b;
	}
	.capacity-bar {
		display: flex;
		height: 14px;
		overflow: hidden;
		border-radius: 99px;
		background: #242925;
	}
	.capacity-segment {
		display: block;
		height: 100%;
	}
	.capacity-legend {
		display: grid;
		gap: 6px;
		padding: 0;
		margin: 0;
		list-style: none;
	}
	.capacity-legend li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		font-size: 0.84rem;
	}
	.capacity-sold {
		opacity: 0.45;
	}
	.capacity-swatch {
		width: 10px;
		height: 10px;
		border-radius: 3px;
	}
</style>
