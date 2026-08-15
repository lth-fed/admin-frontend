<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		addAdmin,
		addGroupRelation,
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
	import type { AdminUser, Group, PutGroup } from '$lib/api/types';
	import { loadGroupUserOptions } from '$lib/group-users';
	import { localize } from '$lib/i18n';
	import LocalizedField from '$lib/components/LocalizedField.svelte';
	import RelationList from '$lib/components/RelationList.svelte';
	import UserList from '$lib/components/UserList.svelte';
	import { uploadImage } from '$lib/image';
	import * as m from '$lib/paraglide/messages';
	import { toasts } from '$lib/toasts.svelte';
	import { ArrowLeft } from '@lucide/svelte';
	import { Switch } from '@svar-ui/svelte-core';

	let { id }: { id: string | null } = $props();
	let loading = $state(false);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let members = $state<AdminUser[]>([]);
	let requests = $state<string[]>([]);
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
	let form = $state<PutGroup>({
		path: '',
		name: { sv: '', en: '' },
		description: { sv: '', en: '' },
		limit_membership_visibility: false,
		logo_id: ''
	});
	const mainFormDirty = $derived(
		savedFormSnapshot !== '' && serializeGroup(form) !== savedFormSnapshot
	);

	beforeNavigate(({ cancel, willUnload }) => {
		if (!mainFormDirty || allowNavigation) return;
		if (willUnload) {
			cancel();
			return;
		}
		if (!confirm(m.unsaved_changes())) cancel();
	});

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
				loadGroupUserOptions()
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
				limit_membership_visibility: group.limit_membership_visibility,
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
		error = `${field}: ${message}`;
		toasts.show('error', error);
	}

	async function addAdministrator(userId: string): Promise<void> {
		if (!userId.startsWith('email:')) {
			showValidation(m.user_id(), m.admin_email_required());
			return;
		}
		if (admins.some((admin) => admin.user_id === userId)) return;
		await action(() => addAdmin(id!, userId), refreshPeople);
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

	async function refreshPeople(): Promise<void> {
		if (id)
			[members, requests, admins] = await Promise.all([
				listMembers(id),
				listMemberRequests(id),
				listAdmins(id)
			]);
		userSuggestions = await loadGroupUserOptions(true);
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
		error = null;
		const wasAlreadyMember =
			members.some((member) => member.user_id === userId) ||
			admins.some((admin) => admin.user_id === userId);
		try {
			await denyMemberRequest(id!, userId, wasAlreadyMember);
		} catch (cause) {
			error = frontendError(cause);
		}
		// The two API calls are intentionally sequential and not atomic. Refresh even
		// if removal fails, because accepting the request may already have succeeded.
		try {
			await refreshPeople();
		} catch (cause) {
			if (error === null) error = frontendError(cause);
		}
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
	<form class="stack" novalidate onsubmit={submit}>
		{#if error}<p class="error-banner" role="alert">{error}</p>{/if}
		{#if directAdmin}
			<section class="card card-pad">
				<h2 class="section-title">{m.group_details()}</h2>
				<div class="grid-2">
					<div class="field">
						<span>{m.replace_logo()}</span>
						{#if logoUrl}
							<div class="logo-preview">
								<img src={logoUrl} alt={m.current_logo()} />
								<span>{m.current_logo()}</span>
							</div>
						{/if}
						<input
							type="file"
							accept="image/jpeg,image/png,image/webp,image/avif"
							onchange={(event) => void chooseLogo(event)} />
						{#if form.logo_id && !logoUrl}<span class="success-banner">{m.image_ready()}</span>{/if}
					</div>
					<LocalizedField
						value={form.name}
						labelSv={m.name_sv()}
						labelEn={m.name_en()}
						required
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
						<label class="field"
							><span>{m.path()}</span><input required bind:value={form.path} /></label>
						<label class="switch-field">
							<Switch
								value={form.limit_membership_visibility}
								onchange={({ value }) => (form.limit_membership_visibility = value)} />
							<span>{m.limit_visibility()}</span>
						</label>
						<p class="muted">{m.limit_visibility_help()}</p>
					</div>
				</details>
			</section>
			{#if id}<section class="card card-pad grid-2">
					<RelationList
						title={m.joiner_groups()}
						items={joiners}
						options={tree}
						onadd={(groupId) => addRelation('joiner-groups', groupId)}
						onremove={(groupId) =>
							action(() => removeGroupRelation(id!, 'joiner-groups', groupId), refreshRelations)} />
					<UserList
						title={m.members()}
						items={members}
						suggestions={userSuggestions}
						allowCustomId
						onadd={(userId) => action(() => addMember(id!, userId), refreshPeople)}
						onremove={(userId) => action(() => removeMember(id!, userId), refreshPeople)} />
					<div>
						<h2 class="section-title">{m.member_requests()}</h2>
						{#if requests.length === 0}
							<p class="empty-state">{m.empty()}</p>
						{:else}
							<ul class="list compact-list">
								{#each requests as userId (userId)}
									<li>
										<span class="mono">{userId}</span>
										<div class="toolbar">
											<button
												class="button-link secondary"
												type="button"
												onclick={() =>
													action(() => approveMemberRequest(id!, userId), refreshPeople)}
												>{m.approve()}</button
											><button
												class="button-link secondary danger-button"
												type="button"
												onclick={() => void denyRequest(userId)}>{m.deny()}</button>
										</div>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
					<RelationList
						title={m.activity_admin_groups()}
						items={activityAdmins}
						options={tree}
						inheritDescendants
						onadd={(groupId) => addRelation('activity-admin-groups', groupId)}
						onremove={(groupId) =>
							action(
								() => removeGroupRelation(id!, 'activity-admin-groups', groupId),
								refreshRelations
							)} />
				</section>{/if}
		{/if}
		{#if id}
			<section class="card card-pad">
				<UserList
					title={m.administrators()}
					items={admins}
					suggestions={userSuggestions.filter((user) => user.user_id.startsWith('email:'))}
					allowEmailInvite
					onadd={addAdministrator}
					onremove={removeAdministrator} />
			</section>
		{/if}
		{#if directAdmin}<div class="editor-action-dock">
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
