<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { Pathname } from '$app/types';
	import {
		addActivityVerifier,
		downloadActivityReport,
		getActivity,
		getTicketKind,
		getMe,
		inviteActivityHost,
		listActivityTicketKinds,
		listGroupTree,
		listPendingActivityHosts,
		listPurchasedTickets,
		listActivityVerifiers,
		removeActivityVerifier,
		saveActivity
	} from '$lib/api/admin';
	import { frontendError } from '$lib/api/client';
	import type {
		AdminUser,
		ActivityTicketKind,
		ExternalSaleCategory,
		Group,
		PutActivity,
		PurchasedTicket,
		ReportRequest,
		TicketKind
	} from '$lib/api/types';
	import { loadGroupUserOptions } from '$lib/group-users';
	import BookkeepingCategorySelect from '$lib/components/BookkeepingCategorySelect.svelte';
	import DateTimePicker from '$lib/components/DateTimePicker.svelte';
	import LocalizedField from '$lib/components/LocalizedField.svelte';
	import MoneyInput from '$lib/components/MoneyInput.svelte';
	import UserList from '$lib/components/UserList.svelte';
	import { dateTime, kronor, localize } from '$lib/i18n';
	import { uploadImage } from '$lib/image';
	import * as m from '$lib/paraglide/messages';
	import {
		ArrowLeft,
		ChevronDown,
		ChevronRight,
		Copy,
		Download,
		Eye,
		EyeOff,
		Plus,
		Send,
		Trash2
	} from '@lucide/svelte';
	import { Select, Switch } from '@svar-ui/svelte-core';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { toasts } from '$lib/toasts.svelte';

	const I32_MAX = 2_147_483_647;
	type ValidationIssue = { field: string; message: string };

	let { id }: { id: string | null } = $props();
	const isNew = $derived(id === null);
	let loading = $state(true);
	let saving = $state(false);
	let reporting = $state(false);
	let uploading = $state(false);
	let error = $state<string | null>(null);
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
	let addonStatistics = $state<AddonStatistic[]>([]);
	const expandedHostGroups = new SvelteSet<string>();
	type AddonStatistic = {
		key: string;
		name: TicketKind['available_addons'][number]['name'];
		answers: number;
		options: Array<{
			key: string;
			name: TicketKind['available_addons'][number]['name'];
			count: number;
		}>;
		texts: string[];
	};
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
	const hostTreeRows = $derived.by(() => {
		const sorted = [...groups].sort((a, b) => a.path.localeCompare(b.path));
		const groupsByPath = new Map(sorted.map((group) => [group.path, group]));
		const parentPaths = new Set(
			sorted.map((group) => group.path.slice(0, group.path.lastIndexOf('.'))).filter(Boolean)
		);

		return sorted
			.filter((group) => {
				const parts = group.path.split('.');
				for (let index = 1; index < parts.length; index += 1) {
					const ancestor = groupsByPath.get(parts.slice(0, index).join('.'));
					if (ancestor && !expandedHostGroups.has(ancestor.id)) return false;
				}
				return true;
			})
			.map((group) => ({
				group,
				depth: group.path
					.split('.')
					.slice(0, -1)
					.filter((_, index, parts) => groupsByPath.has([...parts.slice(0, index + 1)].join('.')))
					.length,
				hasChildren: parentPaths.has(group.path)
			}));
	});

	$effect(() => {
		void load();
	});

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
				const purchases = mayEdit
					? (
							await Promise.all(activityTickets.map((ticket) => listPurchasedTickets(ticket.id)))
						).flat()
					: [];
				addonStatistics = buildAddonStatistics(kinds, purchases);
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
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			loading = false;
		}
	}

	function updateContactKind(value: string | number): void {
		contactKind = value === 'tel' ? 'tel' : 'mailto';
		form.responsible_contact = `${contactKind}:`;
	}

	function normalizedAddonName(name: { sv?: string; en?: string }): string {
		return (name.sv || name.en || '')
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLocaleLowerCase('sv')
			.replace(/[^a-z0-9]/g, '');
	}

	function buildAddonStatistics(
		kinds: TicketKind[],
		purchases: PurchasedTicket[]
	): AddonStatistic[] {
		const kindsById = new SvelteMap(kinds.map((kind) => [kind.ticket_kind_id, kind]));
		const statistics = new SvelteMap<string, AddonStatistic>();
		for (const ticket of purchases) {
			const kind = kindsById.get(ticket.ticket_kind_id);
			if (!kind) continue;
			for (const answer of ticket.addons) {
				const addon = kind.available_addons.find((candidate) => candidate.id === answer.addon_id);
				if (!addon) continue;
				const key = normalizedAddonName(addon.name);
				const statistic = statistics.get(key) ?? {
					key,
					name: addon.name,
					answers: 0,
					options: [],
					texts: []
				};
				statistic.answers += 1;
				for (const selected of answer.selected_options) {
					const option = addon.options.find((candidate) => candidate.idx === selected);
					if (!option) continue;
					const optionKey = normalizedAddonName(option.name);
					const existing = statistic.options.find((candidate) => candidate.key === optionKey);
					if (existing) existing.count += 1;
					else statistic.options.push({ key: optionKey, name: option.name, count: 1 });
				}
				if (answer.selected_text.trim()) statistic.texts.push(answer.selected_text.trim());
				statistics.set(key, statistic);
			}
		}
		return [...statistics.values()].sort((left, right) => left.key.localeCompare(right.key));
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
		if (!form.title.sv.trim()) return issue(m.title_sv(), m.required_fields());
		if (!form.title.en.trim()) return issue(m.title_en(), m.required_fields());
		if (!form.responsible_name.trim()) return issue(m.responsible_name(), m.required_fields());
		if (!contactValue.trim()) return issue(m.responsible_contact(), m.required_fields());
		if (contactKind === 'mailto' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactValue))
			return issue(m.responsible_contact(), m.invalid_email());
		if (contactKind === 'tel' && !/^\+?[0-9][0-9 ()-]{5,}$/.test(contactValue))
			return issue(m.responsible_contact(), m.invalid_phone());
		if (!form.creator_id) return issue(m.creator(), m.required_fields());
		if (!form.image_id) return issue(m.activity_image(), m.required_fields());
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
		if (north && (!Number.isFinite(Number(north)) || Math.abs(Number(north)) > 90))
			return issue(m.latitude(), m.invalid_coordinates());
		if (east && (!Number.isFinite(Number(east)) || Math.abs(Number(east)) > 180))
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

	function toggleHostBranch(groupId: string): void {
		if (expandedHostGroups.has(groupId)) expandedHostGroups.delete(groupId);
		else expandedHostGroups.add(groupId);
	}

	function updateCreator(groupId: string): void {
		if (id) return;
		form.creator_id = groupId;
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
			error = `${validationIssue.field}: ${validationIssue.message}`;
			toasts.show('error', error);
			return;
		}
		saving = true;
		error = null;
		try {
			const activityId = id ?? crypto.randomUUID();
			const keepsAdminAccess = adminGroupIds.some(
				(groupId) => groupId === form.creator_id || form.host_ids.includes(groupId)
			);
			const coordinate = north && east ? { north: Number(north), east: Number(east) } : undefined;
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
			if (!id) {
				await goto(resolve('/activities/[id]', { id: activityId }), { replaceState: true });
			} else {
				savedHostIds = [...form.host_ids];
				if (!keepsAdminAccess) await goto(resolve('/'), { replaceState: true });
			}
		} catch (cause) {
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
			await saveActivity(activityId, {
				...copy,
				is_hidden: true,
				title: {
					sv: `Kopia av ${copy.title.sv}`,
					en: `Copy of ${copy.title.en}`
				}
			});
			await goto(resolve('/activities/[id]', { id: activityId }));
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			saving = false;
		}
	}
</script>

<header class="page-header">
	<div>
		<p class="eyebrow">{m.nav_activities()}</p>
		<h1>
			{isNew ? m.new_activity() : canEdit ? m.edit_activity() : m.activity_details()}{form.title
				.sv || form.title.en
				? ` · ${localize(form.title)}`
				: ''}
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
	<form class="stack" novalidate onsubmit={submit}>
		{#if error}<p class="error-banner" role="alert">{error}</p>{/if}
		{#if !canEdit}<p class="info-banner" role="status">{m.activity_read_only()}</p>{/if}
		<fieldset class="stack activity-editor-fields" disabled={!canEdit}>
			<section class="card card-pad">
				<h2 class="section-title">{m.activity_details()}</h2>
				<div class="grid-2">
					<LocalizedField
						value={form.title}
						labelSv={m.title_sv()}
						labelEn={m.title_en()}
						required
						onchange={(value) => (form.title = value)} />
					<LocalizedField
						value={form.description}
						labelSv={m.description_sv()}
						labelEn={m.description_en()}
						multiline
						onchange={(value) => (form.description = value)} />
					<DateTimePicker label={m.start()} value={form.time_start} onchange={updateStart} />
					<DateTimePicker
						label={m.end()}
						value={form.time_end}
						error={new Date(form.time_end) <= new Date(form.time_start)}
						onchange={(value) => (form.time_end = value)} />
					<label class="field"
						><span>{m.responsible_name()}</span><input
							required
							bind:value={form.responsible_name} /></label>
					<div class="field">
						<span>{m.responsible_contact()}</span>
						<div class="contact-inputs">
							<Select
								value={contactKind}
								options={[
									{ id: 'mailto', label: m.email() },
									{ id: 'tel', label: m.telephone() }
								]}
								onchange={({ value }) => updateContactKind(value)} />
							<input
								required
								type={contactKind === 'mailto' ? 'email' : 'tel'}
								placeholder={contactKind === 'mailto' ? 'admin@example.org' : '+46 70 123 45 67'}
								value={contactValue}
								oninput={(event) => updateContactValue(event.currentTarget.value)} />
						</div>
					</div>
					<div class="field">
						<span>{m.creator()}</span>
						{#if isNew}
							<Select
								value={form.creator_id}
								options={groups
									.filter((group) => adminGroupIds.includes(group.id))
									.map((group) => ({
										id: group.id,
										label: localize(group.name, group.path)
									}))}
								onchange={({ value }) => updateCreator(String(value))} />
						{:else}
							<div class="readonly-value">
								<strong
									>{localize(creatorGroup?.name, creatorGroup?.path ?? form.creator_id)}</strong>
								<small>{m.creator_immutable()}</small>
							</div>
						{/if}
					</div>
				</div>
				<details class="advanced-panel">
					<summary>{m.advanced()}</summary>
					<div class="stack advanced-content">
						<label class="switch-field">
							<Switch value={limitCapacity} onchange={({ value }) => toggleCapacityLimit(value)} />
							<span>{m.limit_max_tickets()}</span>
						</label>
						{#if limitCapacity}
							<label class="field">
								<span>{m.activity_capacity()}</span>
								<small>{m.activity_capacity_help()}</small>
								<input
									type="number"
									min={minimumCapacity}
									max={I32_MAX - 1}
									bind:value={form.max_tickets} />
							</label>
						{/if}
						<label class="switch-field" title={m.hide_other_admins_help()}>
							<Switch
								value={form.is_hidden_for_other_admins}
								onchange={({ value }) => (form.is_hidden_for_other_admins = value)} />
							<span>{m.hide_other_admins()}</span>
						</label>
					</div>
				</details>
			</section>

			<section class="card card-pad">
				<div class="section-heading">
					<h2 class="section-title">{m.location()}</h2>
					<p class="muted">{m.location_optional()}</p>
				</div>
				<div class="grid-2">
					<LocalizedField
						value={form.location.name!}
						labelSv={m.location_sv()}
						labelEn={m.location_en()}
						placeholderSv={m.location_placeholder()}
						placeholderEn={m.location_placeholder()}
						onchange={(value) => (form.location.name = value)} />
					<LocalizedField
						value={form.location.directions!}
						labelSv={m.directions_sv()}
						labelEn={m.directions_en()}
						placeholderSv={m.directions_placeholder()}
						placeholderEn={m.directions_placeholder()}
						multiline
						onchange={(value) => (form.location.directions = value)} />
					<label class="field"
						><span>{m.location_url()}</span><input
							type="url"
							placeholder="https://maps.google.com/…"
							bind:value={form.location.url} /></label>
					<div class="grid-2">
						<label class="field"
							><span>{m.latitude()}</span><input
								type="number"
								step="any"
								bind:value={north} /></label
						><label class="field"
							><span>{m.longitude()}</span><input
								type="number"
								step="any"
								bind:value={east} /></label>
					</div>
				</div>
			</section>

			<section class="card card-pad grid-2">
				<div>
					<div class="section-heading">
						<h2 class="section-title">{m.hosts()}</h2>
						<span class="pill">{m.hosts_selected({ count: form.host_ids.length })}</span>
					</div>
					<p class="muted host-help">
						{id ? m.hosts_invitation_help() : m.save_before_inviting_hosts()}
					</p>
					<div class="host-tree">
						{#each hostTreeRows as row (row.group.id)}
							<div class="host-tree-row" style={`padding-left: ${row.depth * 20 + 8}px`}>
								{#if row.hasChildren}
									<button
										class="tree-toggle"
										type="button"
										aria-label={localize(row.group.name, row.group.path)}
										aria-expanded={expandedHostGroups.has(row.group.id)}
										onclick={() => toggleHostBranch(row.group.id)}>
										{#if expandedHostGroups.has(row.group.id)}
											<ChevronDown size={17} />
										{:else}
											<ChevronRight size={17} />
										{/if}
									</button>
								{:else}
									<span class="tree-toggle-spacer"></span>
								{/if}
								{#if row.group.id === form.creator_id}
									<span class="host-tree-label">
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
											<span>{localize(row.group.name, row.group.path)}</span>
											{#if !adminGroupIds.includes(row.group.id)}
												<span class="pill">{m.host_remove_own_only()}</span>
											{/if}
										</label>
									{:else if pendingHostIds.includes(row.group.id)}
										<span class="host-tree-label">
											{localize(row.group.name, row.group.path)}
											<span class="pill">{m.host_invite_pending()}</span>
										</span>
									{:else}
										<div class="host-tree-invite">
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
							</div>
						{/each}
					</div>
				</div>
				<div>
					<h2 class="section-title">{m.activity_image()}</h2>
					{#if imageUrl}
						<div class="activity-image-preview">
							<img src={imageUrl} alt={m.current_activity_image()} />
							<span>{m.current_activity_image()}</span>
						</div>
					{/if}
					<label class="field"
						><span>{uploading ? m.uploading_image() : m.choose_image()}</span><input
							type="file"
							accept="image/jpeg,image/png,image/webp,image/avif"
							onchange={(event) => void chooseImage(event)} /></label>
					{#if form.image_id}<p class="success-banner">{m.image_ready()} · {form.image_id}</p>{/if}
				</div>
			</section>

			{#if id}
				<section class="card card-pad">
					<div class="toolbar between">
						<h2 class="section-title">{m.tickets()}</h2>
						{#if canEdit}
							<a class="button-link" href={resolve(`/tickets/new/?activity=${id}` as Pathname)}
								><Plus size={17} /> {m.new_ticket()}</a>
						{/if}
					</div>
					{#if tickets.length === 0}<p class="empty-state">{m.empty()}</p>{:else}<ul class="list">
							{#each tickets as ticket (ticket.id)}<li>
									<div class="list-main">
										<strong>{localize(ticket.name)}</strong><span
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
			{/if}

			{#if id && canEdit}
				<section class="card card-pad stack">
					<div>
						<h2 class="section-title">{m.addon_statistics()}</h2>
						<p class="muted">{m.addon_statistics_help()}</p>
					</div>
					{#if addonStatistics.length === 0}
						<p class="empty-state">{m.no_addon_answers()}</p>
					{:else}
						<div class="statistics-grid">
							{#each addonStatistics as statistic (statistic.key)}
								<article class="nested-card stack">
									<div class="toolbar between">
										<h3 class="section-title">{localize(statistic.name)}</h3>
										<span class="pill">{m.answer_count({ count: statistic.answers })}</span>
									</div>
									{#each statistic.options as option (option.key)}
										<div class="statistic-row">
											<div class="toolbar between">
												<span>{localize(option.name)}</span><strong>{option.count}</strong>
											</div>
											<div class="statistic-track">
												<span style={`width: ${(option.count / statistic.answers) * 100}%`}></span>
											</div>
										</div>
									{/each}
									{#if statistic.texts.length > 0}
										<h4 class="section-title">{m.text_answers()}</h4>
										<ul class="answer-list">
											{#each statistic.texts as answer, answerIndex (`${statistic.key}-${answerIndex}`)}
												<li>{answer}</li>
											{/each}
										</ul>
									{/if}
								</article>
							{/each}
						</div>
					{/if}
				</section>
			{/if}

			{#if id && canEdit}
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
			{/if}

			{#if id && canEdit}
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
											updateExternalSale(index, { total: value ?? Number.NaN })} />
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

			<div class="toolbar">
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
