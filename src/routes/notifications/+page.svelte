<script lang="ts">
	import {
		deleteActivityNotification,
		deleteGroupNotification,
		getActivity,
		getMe,
		getTicketKind,
		listActivities,
		listActivityNotifications,
		listActivityTicketKinds,
		listGroupNotifications,
		listGroupTree,
		saveActivityNotification,
		saveGroupNotification
	} from '$lib/api/admin';
	import { frontendError } from '$lib/api/client';
	import type {
		ActivityNotification,
		ActivityNotificationKind,
		BriefActivity,
		Group,
		GroupNotification,
		PutNotification
	} from '$lib/api/types';
	import NotificationFields from '$lib/components/NotificationFields.svelte';
	import NotificationWarnings from '$lib/components/NotificationWarnings.svelte';
	import { dateTime, localize } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { toasts } from '$lib/toasts.svelte';
	import { Pencil, Plus, Trash2 } from '@lucide/svelte';
	import { Select } from '@svar-ui/svelte-core';
	import { tick } from 'svelte';

	type TargetType = 'activity' | 'group';
	type ListedNotification = ActivityNotification | GroupNotification;
	type NotificationListItem = {
		notification: ListedNotification;
		targetType: TargetType;
		targetId: string;
		targetLabel: string;
	};

	let loading = $state(true);
	let saving = $state(false);
	let deletingId = $state<string | null>(null);
	let error = $state<string | null>(null);
	let groups = $state<Group[]>([]);
	let activities = $state<BriefActivity[]>([]);
	let targetType = $state<TargetType>('activity');
	let targetId = $state('');
	let filterType = $state<TargetType | ''>('');
	let filterTargetKey = $state('');
	let notifications = $state<NotificationListItem[]>([]);
	let editingId = $state<string | null>(null);
	let editorOpen = $state(false);
	let editorElement = $state<HTMLElement | null>(null);
	let recipient = $state<ActivityNotificationKind>('buyers');
	let draft = $state<PutNotification>(emptyDraft());
	let dangerousVisibilityByActivity = $state<Record<string, boolean>>({});
	let publishedByActivity = $state<Record<string, boolean>>({});

	const targetOptions = $derived(
		targetType === 'activity'
			? activities.map((activity) => ({ id: activity.id, label: localize(activity.title) }))
			: groups.map((group) => ({ id: group.id, label: localize(group.name, group.path) }))
	);
	const filterTargetOptions = $derived([
		{ id: '', label: m.all_notification_targets() },
		...(filterType !== 'group'
			? activities.map((activity) => ({
					id: `activity:${activity.id}`,
					label: localize(activity.title)
				}))
			: []),
		...(filterType !== 'activity'
			? groups.map((group) => ({
					id: `group:${group.id}`,
					label: localize(group.name, group.path)
				}))
			: [])
	]);
	const filteredNotifications = $derived(
		notifications.filter(
			(item) =>
				(!filterType || item.targetType === filterType) &&
				(!filterTargetKey || `${item.targetType}:${item.targetId}` === filterTargetKey)
		)
	);
	const selectedGroupPath = $derived(
		targetType === 'group' ? groups.find((group) => group.id === targetId)?.path : undefined
	);
	const selectedActivityHasDangerousVisibility = $derived(
		targetType === 'activity' && dangerousVisibilityByActivity[targetId] === true
	);
	const selectedActivityPublished = $derived(
		targetType !== 'activity' || publishedByActivity[targetId] === true
	);
	const selectedSender = $derived(
		targetOptions.find((option) => option.id === targetId)?.label ?? ''
	);

	$effect(() => {
		void load();
	});

	function emptyDraft(): PutNotification {
		return {
			title: { sv: '', en: '' },
			content: { sv: '', en: '' },
			send_at: new Date().toISOString()
		};
	}

	function isActivityNotification(
		notification: ListedNotification
	): notification is ActivityNotification {
		return 'recipient' in notification;
	}

	function recipientLabel(value: ActivityNotificationKind): string {
		switch (value) {
			case 'all':
				return m.notification_recipient_all();
			case 'buyers':
				return m.notification_recipient_buyers();
			case 'ticket_holders':
				return m.notification_recipient_ticket_holders();
		}
	}

	async function load(): Promise<void> {
		loading = true;
		error = null;
		try {
			const [me, tree, futureActivities] = await Promise.all([
				getMe(),
				listGroupTree(),
				listActivities()
			]);
			const adminIds = new Set(me.admin_group_ids);
			groups = tree.filter((group) => adminIds.has(group.id));
			const activityDetails = await Promise.all(
				futureActivities.map(async (brief) => ({ brief, details: await getActivity(brief.id) }))
			);
			publishedByActivity = Object.fromEntries(
				activityDetails.map(({ brief, details }) => [brief.id, !details.is_hidden])
			);
			activities = activityDetails
				.filter(({ details }) => details.hosts.some((host) => adminIds.has(host.id)))
				.map(({ brief }) => brief);
			if (activities.length > 0) {
				targetType = 'activity';
				targetId = activities[0].id;
			} else if (groups.length > 0) {
				targetType = 'group';
				targetId = groups[0].id;
			}
			await Promise.all([refreshNotifications(), refreshDefaultRecipient()]);
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			loading = false;
		}
	}

	async function chooseTargetType(value: TargetType): Promise<void> {
		targetType = value;
		targetId = (value === 'activity' ? activities[0]?.id : groups[0]?.id) ?? '';
		await refreshDefaultRecipient();
	}

	async function chooseTarget(id: string): Promise<void> {
		targetId = id;
		await refreshDefaultRecipient();
	}

	function chooseFilterType(value: string): void {
		filterType = value as TargetType | '';
		filterTargetKey = '';
	}

	async function activityAudienceInfo(activityId: string): Promise<ActivityNotificationKind> {
		const tickets = await listActivityTicketKinds(activityId);
		const kinds = await Promise.all(tickets.map((ticket) => getTicketKind(ticket.id)));
		dangerousVisibilityByActivity = {
			...dangerousVisibilityByActivity,
			[activityId]: kinds.some(
				(kind) =>
					kind.max_tickets === 0 &&
					kind.allowed_group_ids.some((groupId) => {
						const path = groups.find((group) => group.id === groupId)?.path;
						return path !== undefined && path.split('.').length <= 2;
					})
			)
		};
		if (kinds.some((kind) => kind.has_been_purchased)) return 'ticket_holders';
		return kinds.some((kind) => kind.max_tickets > 0) ? 'buyers' : 'all';
	}

	async function refreshDefaultRecipient(): Promise<void> {
		if (targetType !== 'activity' || !targetId) return;
		error = null;
		try {
			recipient = await activityAudienceInfo(targetId);
		} catch (cause) {
			error = frontendError(cause);
		}
	}

	async function refreshNotifications(): Promise<void> {
		const now = Date.now();
		const [activityNotifications, groupNotifications] = await Promise.all([
			Promise.all(
				activities.map(async (activity) =>
					(await listActivityNotifications(activity.id)).map((notification) => ({
						notification,
						targetType: 'activity' as const,
						targetId: activity.id,
						targetLabel: localize(activity.title)
					}))
				)
			),
			Promise.all(
				groups.map(async (group) =>
					(await listGroupNotifications(group.id))
						.filter((notification) => new Date(notification.send_at).getTime() > now)
						.map((notification) => ({
							notification,
							targetType: 'group' as const,
							targetId: group.id,
							targetLabel: localize(group.name, group.path)
						}))
				)
			)
		]);
		notifications = [...activityNotifications.flat(), ...groupNotifications.flat()].sort(
			(a, b) =>
				new Date(a.notification.send_at).getTime() - new Date(b.notification.send_at).getTime()
		);
	}

	async function showEditor(): Promise<void> {
		editorOpen = true;
		await tick();
		editorElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	async function edit(item: NotificationListItem): Promise<void> {
		const { notification } = item;
		if (notification.sent) return;
		targetType = item.targetType;
		targetId = item.targetId;
		editingId = notification.id;
		draft = {
			title: { ...notification.title },
			content: { ...notification.content },
			send_at: notification.send_at
		};
		if (isActivityNotification(notification)) recipient = notification.recipient;
		if (item.targetType === 'activity') await activityAudienceInfo(item.targetId);
		await showEditor();
	}

	async function newNotification(): Promise<void> {
		editingId = null;
		draft = emptyDraft();
		await refreshDefaultRecipient();
		await showEditor();
	}

	function closeEditor(): void {
		editorOpen = false;
		editingId = null;
		draft = emptyDraft();
	}

	async function save(): Promise<void> {
		if (!targetId || saving || !selectedActivityPublished) return;
		if (
			!draft.title.sv?.trim() ||
			!draft.title.en?.trim() ||
			!draft.content.sv?.trim() ||
			!draft.content.en?.trim()
		) {
			error = m.required_fields();
			return;
		}
		saving = true;
		error = null;
		try {
			const id = editingId ?? crypto.randomUUID();
			if (targetType === 'activity') {
				await saveActivityNotification(targetId, id, { recipient, ...draft });
			} else {
				await saveGroupNotification(targetId, id, draft);
			}
			await refreshNotifications();
			closeEditor();
			toasts.show('success', m.backend_success());
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			saving = false;
		}
	}

	async function remove(item: NotificationListItem): Promise<void> {
		const { notification } = item;
		if (notification.sent || !confirm(m.delete_notification_confirm())) return;
		deletingId = notification.id;
		error = null;
		try {
			if (item.targetType === 'activity') {
				await deleteActivityNotification(item.targetId, notification.id);
			} else {
				await deleteGroupNotification(item.targetId, notification.id);
			}
			await refreshNotifications();
			toasts.show('success', m.backend_success());
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			deletingId = null;
		}
	}
</script>

<svelte:head><title>{m.notifications_title()} · {m.app_name()}</title></svelte:head>

<div class="page-header">
	<div>
		<p class="eyebrow">{m.nav_notifications()}</p>
		<h1>{m.notifications_title()}</h1>
		<p class="muted">{m.notifications_description()}</p>
	</div>
</div>

{#if error}<p class="error-banner" role="alert">{error}</p>{/if}
{#if loading}
	<div class="loader"></div>
{:else}
	<section class="card card-pad stack">
		<div class="section-heading">
			<h2 class="section-title">{m.scheduled_notifications()}</h2>
			<button class="button-link secondary" type="button" onclick={() => void newNotification()}>
				<Plus size={17} />
				{m.new_notification()}
			</button>
		</div>
		<div class="grid-2">
			<label class="field">
				<span>{m.filter_notification_type()}</span>
				<Select
					value={filterType}
					options={[
						{ id: '', label: m.all_notification_types() },
						{ id: 'activity', label: m.notification_target_activity() },
						{ id: 'group', label: m.notification_target_group() }
					]}
					onchange={({ value }) => chooseFilterType(String(value))} />
			</label>
			<label class="field">
				<span>{m.filter_notification_target()}</span>
				<Select
					value={filterTargetKey}
					options={filterTargetOptions}
					onchange={({ value }) => (filterTargetKey = String(value))} />
			</label>
		</div>
		{#if filteredNotifications.length === 0}
			<p class="empty-state">{m.empty()}</p>
		{:else}
			<ul class="list">
				{#each filteredNotifications as item (`${item.targetType}:${item.targetId}:${item.notification.id}`)}
					{@const notification = item.notification}
					<li>
						<div class="list-main">
							<strong>{localize(notification.title, m.notification())}</strong>
							<span
								>{item.targetLabel} · {item.targetType === 'activity'
									? m.notification_target_activity()
									: m.notification_target_group()}</span>
							<span>
								{dateTime(notification.send_at)} · {notification.sent ? m.sent() : m.not_sent()}
								{#if isActivityNotification(notification)}
									· {recipientLabel(notification.recipient)}
								{/if}
							</span>
							<span>{localize(notification.content)}</span>
						</div>
						<div class="toolbar">
							<button
								class="icon-button"
								type="button"
								disabled={notification.sent}
								aria-label={m.edit()}
								title={notification.sent ? m.sent() : m.edit()}
								onclick={() => void edit(item)}><Pencil size={16} /></button>
							<button
								class="icon-button danger-button"
								type="button"
								disabled={notification.sent || deletingId === notification.id}
								aria-label={m.delete()}
								title={notification.sent ? m.sent() : m.delete()}
								onclick={() => void remove(item)}><Trash2 size={16} /></button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}

		{#if editorOpen}
			<div class="nested-card stack" bind:this={editorElement}>
				<div class="section-heading">
					<h2 class="section-title">
						{editingId ? m.edit_notification() : m.new_notification()}
					</h2>
				</div>
				<div class="grid-2">
					<label class="field">
						<span>{m.notification_target_type()}</span>
						<Select
							value={targetType}
							options={[
								{ id: 'activity', label: m.notification_target_activity() },
								{ id: 'group', label: m.notification_target_group() }
							]}
							disabled={editingId !== null}
							onchange={({ value }) => void chooseTargetType(String(value) as TargetType)} />
					</label>
					<label class="field">
						<span>{m.notification_target_entity()}</span>
						<Select
							value={targetId}
							options={targetOptions}
							disabled={editingId !== null}
							onchange={({ value }) => void chooseTarget(String(value))} />
					</label>
				</div>
				{#if targetType === 'activity'}
					<label class="field">
						<span>{m.notification_recipient()}</span>
						<Select
							value={recipient}
							options={[
								{ id: 'all', label: m.notification_recipient_all() },
								{ id: 'buyers', label: m.notification_recipient_buyers() },
								{ id: 'ticket_holders', label: m.notification_recipient_ticket_holders() }
							]}
							onchange={({ value }) => (recipient = String(value) as ActivityNotificationKind)} />
					</label>
					{#if recipient === 'buyers'}
						<p class="warning-banner" role="note">{m.activity_notification_recipients_warning()}</p>
					{/if}
				{:else}
					<p class="warning-banner" role="note">{m.group_notification_recipients_warning()}</p>
				{/if}
				<NotificationWarnings
					sendAt={draft.send_at}
					groupPath={selectedGroupPath}
					activityRecipient={targetType === 'activity' ? recipient : undefined}
					dangerousActivityVisibility={selectedActivityHasDangerousVisibility} />
				<div class="grid-2">
					<NotificationFields
						value={draft}
						sender={selectedSender}
						onchange={(value) => (draft = value)} />
				</div>
				{#if !selectedActivityPublished}
					<p class="error-banner" role="alert">{m.activity_not_published_notification()}</p>
				{/if}
				<div class="toolbar">
					<button
						class="button-link"
						type="button"
						disabled={saving || !targetId || !selectedActivityPublished}
						title={selectedActivityPublished ? undefined : m.activity_not_published_notification()}
						onclick={() => void save()}>
						{saving ? m.saving() : m.save_notification()}
					</button>
					<button
						class="button-link secondary"
						type="button"
						disabled={saving}
						onclick={closeEditor}>
						{m.cancel()}
					</button>
				</div>
			</div>
		{/if}
	</section>
{/if}
