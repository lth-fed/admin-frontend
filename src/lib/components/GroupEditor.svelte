<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		addAdmin,
		addGroupRelation,
		createApiKey,
		createExternalUser,
		addMember,
		approveMemberRequest,
		deleteGroup,
		denyMemberRequest,
		getMe,
		listAdmins,
		listGroupRelations,
		listGroupTree,
		listMemberRequests,
		listMembers,
		removeAdmin,
		removeGroupRelation,
		removeMember,
		saveGroup
	} from '$lib/api/admin';
	import { frontendError } from '$lib/api/client';
	import type { AdminMember, AdminUser, Group, PutGroup } from '$lib/api/types';
	import { loadVisibleMemberOptions } from '$lib/visible-members';
	import { groupTabIndex, groupTabUrl, isGroupTabNavigation, type GroupTab } from '$lib/group-tabs';
	import { dateTime, localize } from '$lib/i18n';
	import LocalizedField from '$lib/components/LocalizedField.svelte';
	import ActivityTabs from '$lib/components/ActivityTabs.svelte';
	import RelationList from '$lib/components/RelationList.svelte';
	import UserList from '$lib/components/UserList.svelte';
	import SalesDevices from '$lib/components/SalesDevices.svelte';
	import ExpirySelect from '$lib/components/ExpirySelect.svelte';
	import GroupTags from '$lib/components/GroupTags.svelte';
	import GroupReaders from '$lib/components/GroupReaders.svelte';
	import GroupSales from '$lib/components/GroupSales.svelte';
	import { uploadImage } from '$lib/image';
	import * as m from '$lib/paraglide/messages';
	import { toasts } from '$lib/toasts.svelte';
	import { ArrowLeft } from '@lucide/svelte';
	import { Switch } from '@svar-ui/svelte-core';

	let { id }: { id: string | null } = $props();
	let loading = $state(false);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let invalidField = $state<string | null>(null);
	let members = $state<AdminMember[]>([]);
	/** Expiry applied to the next member added; `null` means forever. */
	let newMemberUntil = $state<string | null>(null);
	let requests = $state<AdminUser[]>([]);
	let admins = $state<AdminUser[]>([]);
	let userSuggestions = $state<AdminUser[]>([]);
	let joiners = $state<Group[]>([]);
	let activityAdmins = $state<Group[]>([]);
	let logoUrl = $state('');
	let originalPath = $state('');
	let tree = $state<Group[]>([]);
	let adminGroupIds = $state<string[]>([]);
	let directAdmin = $state(false);
	let savedFormSnapshot = $state('');
	let allowNavigation = $state(false);
	let apiUserId = $state('');
	let apiUserEmail = $state('');
	let createdApiKey = $state<{ user_id: string; api_key: string } | null>(null);
	let externalUserName = $state('');
	let createdExternalUser = $state<string | null>(null);
	let editorTab = $derived(groupTabIndex(page.url));
	const editorTabs = new Map<GroupTab, string>([
		['details', m.group_details()],
		['members', m.members()],
		['administrators', m.administrators()],
		['sales', m.sales()],
		['tags', m.group_tags()],
		['readers', m.readers()]
	]);
	let form = $state<PutGroup>({
		path: '',
		name: { sv: '', en: '' },
		description: { sv: '', en: '' },
		propagate_member_visibility_access: false,
		parent_members_can_join: false,
		logo_id: ''
	});
	const mainFormDirty = $derived(
		savedFormSnapshot !== '' && serializeGroup(form) !== savedFormSnapshot
	);

	beforeNavigate(({ cancel, from, to, willUnload }) => {
		if (!mainFormDirty || allowNavigation) return;
		if (isGroupTabNavigation(from?.url ?? null, to?.url ?? null)) return;
		if (willUnload) {
			cancel();
			return;
		}
		if (!confirm(m.unsaved_changes())) cancel();
	});

	function changeEditorTab(tab: GroupTab): void {
		if (tab === editorTab) return;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- helper keeps the current resolved route and changes only its tab query
		void goto(groupTabUrl(page.url, tab), { keepFocus: true, noScroll: true });
	}

	$effect(() => {
		if (id) void load();
	});

	async function load(): Promise<void> {
		if (!id) return;
		loading = true;
		error = null;
		try {
			const [loadedTree, me, loadedUsers] = await Promise.all([
				listGroupTree(),
				getMe(),
				loadVisibleMemberOptions()
			]);
			tree = loadedTree;
			userSuggestions = loadedUsers;
			adminGroupIds = me.admin_group_ids;
			const group = tree.find((item) => item.id === id);
			if (!group) throw new Error(m.not_found());
			directAdmin = adminGroupIds.includes(group.id);
			const parentPath = group.path.slice(0, group.path.lastIndexOf('.'));
			const parent = tree.find((item) => item.path === parentPath);
			const parentAdmin = parent !== undefined && adminGroupIds.includes(parent.id);
			if (!directAdmin && !parentAdmin) throw new Error(m.not_found());
			form = {
				path: group.path,
				name: { ...group.name },
				description: { ...group.description },
				propagate_member_visibility_access: group.propagate_member_visibility_access,
				parent_members_can_join: group.parent_members_can_join,
				logo_id: group.logo_id
			};
			savedFormSnapshot = serializeGroup(form);
			originalPath = group.path;
			logoUrl = group.logo_url;
			if (directAdmin) {
				[members, requests, admins, joiners, activityAdmins] = await Promise.all([
					listMembers(id),
					listMemberRequests(id),
					listAdmins(id),
					listGroupRelations(id, 'joiner-groups'),
					listGroupRelations(id, 'activity-admin-groups')
				]);
			} else {
				admins = await listAdmins(id);
			}
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			loading = false;
		}
	}

	function serializeGroup(value: PutGroup): string {
		return JSON.stringify(value);
	}

	function validPath(path: string): boolean {
		return /^[a-z0-9_]+(?:\.[a-z0-9_]+)+$/.test(path);
	}

	type ValidationIssue = { field: string; message: string };

	function validateGroup(body: PutGroup): ValidationIssue | null {
		if (!body.name.sv.trim()) return { field: m.name_sv(), message: m.required_fields() };
		if (!body.name.en.trim()) return { field: m.name_en(), message: m.required_fields() };
		if (!body.logo_id) return { field: m.group_logo(), message: m.required_fields() };
		if (!validPath(body.path)) return { field: m.path(), message: m.invalid_group_path() };
		if (tree.some((group) => group.id !== id && group.path === body.path))
			return { field: m.path(), message: m.group_path_exists() };
		const targetParentPath = body.path.slice(0, body.path.lastIndexOf('.'));
		const targetParent = tree.find((group) => group.path === targetParentPath);
		if (!targetParent) return { field: m.path(), message: m.group_parent_missing() };
		if (body.path !== originalPath && !adminGroupIds.includes(targetParent.id))
			return { field: m.path(), message: m.direct_parent_admin_required() };
		return null;
	}

	function showValidation(field: string, message: string): void {
		invalidField = field;
		error = `${field}: ${message}`;
		toasts.show('error', error);
	}

	async function addAdministrator(userId: string): Promise<void> {
		if (!userId.startsWith('email:')) {
			showValidation(m.user_id(), m.admin_email_required());
			return;
		}
		if (admins.some((admin) => admin.user_id === userId)) return;
		error = null;
		try {
			await addAdmin(id!, userId);
			const me = directAdmin ? null : await getMe();
			if (me?.admin_group_ids.includes(id!)) {
				allowNavigation = true;
				window.location.reload();
				return;
			}
			const added = userSuggestions.find((user) => user.user_id === userId) ?? { user_id: userId };
			admins = [...admins, added].sort((left, right) => left.user_id.localeCompare(right.user_id));
		} catch (cause) {
			error = frontendError(cause);
		}
	}

	async function removeAdministrator(userId: string): Promise<void> {
		if (admins.length <= 1) {
			showValidation(m.administrators(), m.last_admin_required());
			return;
		}
		await action(() => removeAdmin(id!, userId), refreshPeople);
	}

	async function addRelation(
		relation: 'joiner-groups' | 'activity-admin-groups',
		groupId: string
	): Promise<void> {
		const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
		if (!uuid.test(groupId) || !tree.some((group) => group.id === groupId)) {
			showValidation(m.group_id(), m.invalid_group_ids());
			return;
		}
		const current = relation === 'joiner-groups' ? joiners : activityAdmins;
		if (current.some((group) => group.id === groupId)) return;
		await action(() => addGroupRelation(id!, relation, groupId), refreshRelations);
	}

	async function chooseLogo(event: Event): Promise<void> {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		saving = true;
		try {
			form.logo_id = await uploadImage(file);
			logoUrl = URL.createObjectURL(file);
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			saving = false;
		}
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		error = null;
		invalidField = null;
		const validationIssue = validateGroup(form);
		if (validationIssue) {
			showValidation(validationIssue.field, validationIssue.message);
			return;
		}
		saving = true;
		try {
			await saveGroup(id!, form);
			savedFormSnapshot = serializeGroup(form);
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			saving = false;
		}
	}

	async function setMembershipUntil(memberId: string, until: string | null): Promise<void> {
		if (!id) return;
		error = null;
		try {
			await addMember(id, memberId, until);
			await refreshPeople();
		} catch (cause) {
			error = frontendError(cause);
		}
	}

	async function refreshPeople(): Promise<void> {
		if (id)
			[members, requests, admins] = await Promise.all([
				listMembers(id),
				listMemberRequests(id),
				listAdmins(id)
			]);
		userSuggestions = await loadVisibleMemberOptions(true);
	}
	async function refreshRelations(): Promise<void> {
		if (id)
			[joiners, activityAdmins] = await Promise.all([
				listGroupRelations(id, 'joiner-groups'),
				listGroupRelations(id, 'activity-admin-groups')
			]);
	}
	async function action(run: () => Promise<void>, refresh: () => Promise<void>): Promise<void> {
		error = null;
		try {
			await run();
			await refresh();
		} catch (cause) {
			error = frontendError(cause);
		}
	}
	async function denyRequest(userId: string): Promise<void> {
		await action(() => denyMemberRequest(id!, userId), refreshPeople);
	}
	async function hide(): Promise<void> {
		if (!id || !confirm(m.delete_group_confirm())) return;
		error = null;
		try {
			await deleteGroup(id);
			allowNavigation = true;
			await goto(resolve('/groups'));
		} catch (cause) {
			allowNavigation = false;
			error = frontendError(cause);
		}
	}

	async function createApiUser(): Promise<void> {
		if (!id || !apiUserId.trim()) return;
		error = null;
		try {
			createdApiKey = await createApiKey({
				id: apiUserId.trim(),
				email: apiUserEmail.trim() || undefined,
				group_ids: [id]
			});
			apiUserId = '';
			apiUserEmail = '';
			toasts.show('success', m.backend_success());
			await refreshPeople();
		} catch (cause) {
			error = frontendError(cause);
		}
	}

	async function createExternalUserForGroup(): Promise<void> {
		if (!id || !externalUserName.trim()) return;
		error = null;
		try {
			const created = await createExternalUser({
				name: externalUserName.trim(),
				group_ids: [id]
			});
			createdExternalUser = created.user_id;
			externalUserName = '';
			toasts.show('success', m.backend_success());
			await refreshPeople();
		} catch (cause) {
			error = frontendError(cause);
		}
	}
</script>

<header class="page-header edit-page-header">
	<div>
		<p class="eyebrow">{m.nav_groups()}</p>
		<h1>
			{directAdmin ? m.group_details() : m.manage_admins()}{form.name.sv || form.name.en
				? ` · ${localize(form.name, form.path)}`
				: ''}
		</h1>
	</div>
	<a class="button-link secondary" href={resolve('/groups')}><ArrowLeft size={18} /> {m.back()}</a>
</header>

{#if loading}<div class="center-stage">
		<div class="loader"></div>
		<p>{m.loading()}</p>
	</div>{:else if error && !form.path}
	<div class="card card-pad error-banner" role="alert">{error}</div>
{:else}
	{#if directAdmin}
		<ActivityTabs
			labels={editorTabs}
			active={editorTab}
			accessibleLabel={m.group_details()}
			onchange={changeEditorTab} />
	{/if}
	<form class="stack" novalidate onsubmit={submit}>
		{#if error}<p class="error-banner" role="alert">{error}</p>{/if}
		{#if directAdmin && editorTab === 'details'}
			<section class="card card-pad">
				<h2 class="section-title">{m.group_details()}</h2>
				<div class="grid-2">
					<div class:field-error={invalidField === m.group_logo()} class="field">
						<span>{m.replace_logo()}</span>
						{#if logoUrl}
							<div class="logo-preview">
								<img src={logoUrl} alt={m.current_logo()} />
								<span>{m.current_logo()}</span>
							</div>
						{/if}
						<input
							type="file"
							accept="image/jpeg,image/png,image/webp,image/avif,image/svg+xml"
							onchange={(event) => void chooseLogo(event)} />
						{#if form.logo_id && !logoUrl}<span class="success-banner">{m.image_ready()}</span>{/if}
					</div>
					<LocalizedField
						value={form.name}
						labelSv={m.name_sv()}
						labelEn={m.name_en()}
						required
						errorSv={invalidField === m.name_sv()}
						errorEn={invalidField === m.name_en()}
						onchange={(value) => (form.name = value)} />
					<LocalizedField
						value={form.description}
						labelSv={m.description_sv()}
						labelEn={m.description_en()}
						multiline
						onchange={(value) => (form.description = value)} />
				</div>
				<details class="advanced-panel">
					<summary>{m.advanced()}</summary>
					<div class="advanced-content">
						<label class:field-error={invalidField === m.path()} class="field"
							><span>{m.path()}</span><input
								required
								aria-invalid={invalidField === m.path()}
								bind:value={form.path} /></label>
						<label class="switch-field"> </label>
						<p class="muted">{m.limit_visibility_help()}</p>
						<label class="switch-field">
							<Switch
								value={form.propagate_member_visibility_access}
								onchange={({ value }) => (form.propagate_member_visibility_access = value)} />
							<span>{m.propagate_member_visibility()}</span>
						</label>
						<p class="muted">{m.propagate_member_visibility_help()}</p>
						<label class="switch-field">
							<Switch
								value={form.parent_members_can_join}
								onchange={({ value }) => (form.parent_members_can_join = value)} />
							<span>{m.parent_members_can_join()}</span>
						</label>
						<p class="muted">{m.parent_members_can_join_help()}</p>
					</div>
				</details>
			</section>
		{/if}
		{#if id && editorTab === 'sales'}
			<GroupSales groupId={id} />
			<SalesDevices groupId={id} canEdit={directAdmin} />
		{/if}
		{#if directAdmin && id && editorTab === 'tags'}
			<GroupTags groupId={id} />
		{/if}
		{#if id && editorTab === 'readers'}
			<GroupReaders groupId={id} canEdit={directAdmin} />
		{/if}
		{#if directAdmin && id && editorTab === 'members'}<section class="card card-pad grid-2">
				<RelationList
					title={m.joiner_groups()}
					items={joiners}
					options={tree}
					onadd={(groupId) => addRelation('joiner-groups', groupId)}
					onremove={(groupId) =>
						action(() => removeGroupRelation(id!, 'joiner-groups', groupId), refreshRelations)} />
				<UserList
					class="row-span-2"
					title={m.members()}
					count={members.length}
					items={members}
					suggestions={userSuggestions}
					allowLuId
					onadd={(userId) => action(() => addMember(id!, userId, newMemberUntil), refreshPeople)}
					onremove={(userId) => action(() => removeMember(id!, userId), refreshPeople)}>
					{#snippet detail(member)}
						{#if member.user_id}
							<details class="member-duration">
								<summary>
									{member.until
										? `${m.membership_duration()}: ${dateTime(member.until)}`
										: m.membership_no_end()}
								</summary>
								<ExpirySelect
									label={m.membership_duration()}
									allowNever
									initial={member.until ?? null}
									onchange={(until) => void setMembershipUntil(member.user_id, until)} />
							</details>
						{/if}
					{/snippet}
				</UserList>
				<div class="member-duration-default">
					<ExpirySelect
						label={m.membership_duration_new()}
						allowNever
						onchange={(until) => (newMemberUntil = until)} />
				</div>
				<div>
					<h2 class="section-title">
						{m.member_requests()} <span class="pill">{requests.length}</span>
					</h2>
					{#if requests.length === 0}
						<p class="empty-state">{m.empty()}</p>
					{:else}
						<ul class="list compact-list">
							{#each requests as request (request.user_id)}
								<li>
									<div class="list-main">
										{#if request.name}<strong>{request.name}</strong>{/if}
										<span class="mono">{request.user_id}</span>
									</div>
									<div class="toolbar">
										<button
											class="button-link secondary"
											type="button"
											onclick={() =>
												action(() => approveMemberRequest(id!, request.user_id), refreshPeople)}
											>{m.approve()}</button
										><button
											class="button-link secondary danger-button"
											type="button"
											onclick={() => void denyRequest(request.user_id)}>{m.deny()}</button>
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</section>

			<section class="card card-pad stack">
				<div>
					<h2 class="section-title">{m.external_users()}</h2>
					<p class="muted">{m.external_user_help()}</p>
				</div>
				<label class="field"
					><span>{m.external_user_name()}</span>
					<input type="text" bind:value={externalUserName} /></label>
				<button
					class="button-link"
					type="button"
					disabled={!externalUserName.trim()}
					onclick={() => void createExternalUserForGroup()}>{m.create_external_user()}</button>
				{#if createdExternalUser}
					<p role="status">
						{m.external_user_created()} <code class="mono">{createdExternalUser}</code>
					</p>
				{/if}
			</section>
		{/if}
		{#if id && (!directAdmin || editorTab === 'administrators')}
			<section class="card card-pad grid-2">
				<UserList
					title={m.administrators()}
					count={admins.length}
					items={admins}
					suggestions={userSuggestions.filter((user) => user.user_id.startsWith('email:'))}
					allowEmailInvite
					onadd={addAdministrator}
					onremove={removeAdministrator} />

				<RelationList
					title={m.activity_admin_groups()}
					titleHelp={m.activity_admin_groups_help()}
					items={activityAdmins}
					options={tree}
					inheritDescendants
					onadd={(groupId) => addRelation('activity-admin-groups', groupId)}
					onremove={(groupId) =>
						action(
							() => removeGroupRelation(id!, 'activity-admin-groups', groupId),
							refreshRelations
						)} />
			</section>
			<section class="card card-pad stack">
				<div>
					<h2 class="section-title">{m.api_users()}</h2>
					<p class="muted">{m.api_user_help()}</p>
				</div>
				<div class="grid-2">
					<label class="field"
						><span>{m.api_user_id()}</span>
						<input type="text" bind:value={apiUserId} placeholder="integration-name" /></label>
					<label class="field"
						><span>{m.api_user_email()}</span>
						<input type="email" bind:value={apiUserEmail} /></label>
				</div>
				<button
					class="button-link"
					type="button"
					disabled={!apiUserId.trim()}
					onclick={() => void createApiUser()}>{m.create_api_user()}</button>
				{#if createdApiKey}
					<p role="status">
						{m.api_key_created()}
						<code class="mono">{createdApiKey.user_id}</code>
						<code class="mono">{createdApiKey.api_key}</code>
					</p>
				{/if}
			</section>
		{/if}
		{#if directAdmin && editorTab === 'details'}<div class="editor-action-dock">
				<button class="button-link" type="submit" disabled={saving}
					>{saving ? m.saving() : m.save()}</button
				><button
					class="button-link secondary danger-button"
					type="button"
					disabled={saving}
					onclick={() => void hide()}>{m.delete()}</button>
			</div>{/if}
	</form>
{/if}
