<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getMe, listGroupTree, saveGroup } from '$lib/api/admin';
	import { frontendError } from '$lib/api/client';
	import type { Group, PutGroup } from '$lib/api/types';
	import LocalizedField from '$lib/components/LocalizedField.svelte';
	import { uploadImage } from '$lib/image';
	import { localize } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { toasts } from '$lib/toasts.svelte';
	import { ArrowLeft } from '@lucide/svelte';
	import { Switch } from '@svar-ui/svelte-core';

	let parent = $state<Group | null>(null);
	let tree = $state<Group[]>([]);
	let loading = $state(true);
	let saving = $state(false);
	let logoUploading = $state(false);
	let error = $state<string | null>(null);
	let logoUrl = $state('');
	let pathOverride = $state(false);
	let formSnapshot = $state('');
	let allowNavigation = $state(false);
	let form = $state<PutGroup>({
		path: '',
		name: { sv: '', en: '' },
		description: { sv: '', en: '' },
		limit_membership_visibility: false,
		logo_id: ''
	});
	const formDirty = $derived(formSnapshot !== '' && serializeGroup(form) !== formSnapshot);

	beforeNavigate(({ cancel, willUnload }) => {
		if (!formDirty || allowNavigation) return;
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
			const [loadedTree, me] = await Promise.all([listGroupTree(), getMe()]);
			tree = loadedTree;
			parent = tree.find((group) => group.id === page.params.id) ?? null;
			if (!parent || !me.admin_group_ids.includes(parent.id)) throw new Error(m.not_found());
			form = {
				path: `${parent.path}.`,
				name: { sv: '', en: '' },
				description: { sv: '', en: '' },
				limit_membership_visibility: false,
				logo_id: parent.logo_id
			};
			logoUrl = parent.logo_url;
			formSnapshot = serializeGroup(form);
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			loading = false;
		}
	}

	function serializeGroup(value: PutGroup): string {
		return JSON.stringify(value);
	}

	function pathPart(name: string): string {
		return name
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLocaleLowerCase('sv')
			.trim()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_+|_+$/g, '');
	}

	function generatedPath(name = form.name.sv): string {
		const part = pathPart(name);
		return parent ? `${parent.path}.${part}` : '';
	}

	function updateName(value: PutGroup['name']): void {
		form.name = value;
		if (!pathOverride) form.path = generatedPath(value.sv);
	}

	function togglePathOverride(enabled: boolean): void {
		pathOverride = enabled;
		if (!enabled) form.path = generatedPath();
	}

	type ValidationIssue = { field: string; message: string };

	function validate(): ValidationIssue | null {
		if (!parent) return { field: m.group_details(), message: m.not_found() };
		if (!form.name.sv.trim()) return { field: m.name_sv(), message: m.required_fields() };
		if (!form.name.en.trim()) return { field: m.name_en(), message: m.required_fields() };
		if (!form.logo_id) return { field: m.group_logo(), message: m.required_fields() };
		if (!/^[a-z0-9_]+(?:\.[a-z0-9_]+)+$/.test(form.path))
			return { field: m.path(), message: m.invalid_group_path() };
		if (
			!form.path.startsWith(`${parent.path}.`) ||
			form.path.split('.').length !== parent.path.split('.').length + 1
		)
			return { field: m.path(), message: m.child_path_required() };
		if (tree.some((group) => group.path === form.path))
			return { field: m.path(), message: m.group_path_exists() };
		return null;
	}

	function showValidation(field: string, message: string): void {
		error = `${field}: ${message}`;
		toasts.show('error', error);
	}

	async function chooseLogo(event: Event): Promise<void> {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		logoUploading = true;
		try {
			form.logo_id = await uploadImage(file);
			logoUrl = URL.createObjectURL(file);
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			logoUploading = false;
		}
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		error = null;
		const validationIssue = validate();
		if (validationIssue) {
			showValidation(validationIssue.field, validationIssue.message);
			return;
		}
		saving = true;
		try {
			const id = crypto.randomUUID();
			await saveGroup(id, form);
			formSnapshot = serializeGroup(form);
			allowNavigation = true;
			await goto(resolve('/groups/[id]', { id }));
		} catch (cause) {
			allowNavigation = false;
			error = frontendError(cause);
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>{m.create_child_group()} · {m.app_name()}</title></svelte:head>

<header class="page-header edit-page-header">
	<div>
		<p class="eyebrow">{m.nav_groups()}</p>
		<h1>
			{m.create_child_group()}{parent ? ` · ${localize(parent.name, parent.path)}` : ''}
		</h1>
	</div>
	<a class="button-link secondary" href={resolve('/groups')}><ArrowLeft size={18} /> {m.back()}</a>
</header>

{#if loading}
	<div class="center-stage">
		<div class="loader"></div>
		<p>{m.loading()}</p>
	</div>
{:else if !parent}
	<div class="card card-pad error-banner" role="alert">{error ?? m.not_found()}</div>
{:else}
	<form class="stack" novalidate onsubmit={submit}>
		{#if error}<p class="error-banner" role="alert">{error}</p>{/if}
		<section class="card card-pad stack">
			<div>
				<h2 class="section-title">{m.create_child_group()}</h2>
				<p class="muted">{m.child_group_help()}</p>
			</div>
			<div class="grid-2">
				<LocalizedField
					value={form.name}
					labelSv={m.name_sv()}
					labelEn={m.name_en()}
					required
					onchange={updateName} />
				<div class="field child-logo-field">
					<span>{m.group_logo()}</span>
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
					{#if logoUploading}
						<span class="muted">{m.uploading_image()}</span>
					{:else if form.logo_id && !logoUrl}
						<span class="success-banner">{m.image_ready()}</span>
					{/if}
				</div>
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
					<label class="switch-field path-override-action">
						<Switch value={pathOverride} onchange={({ value }) => togglePathOverride(value)} />
						<span>{m.override_path()}</span>
					</label>
					<label class="field">
						<span>{m.path()}</span>
						<input required disabled={!pathOverride} bind:value={form.path} />
					</label>
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
		<div class="editor-action-dock">
			<button class="button-link" type="submit" disabled={saving || logoUploading}
				>{saving ? m.saving() : m.create_child_group()}</button>
			<a class="button-link secondary" href={resolve('/groups')}>{m.cancel()}</a>
		</div>
	</form>
{/if}
