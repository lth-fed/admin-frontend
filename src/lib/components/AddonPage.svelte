<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount, tick } from 'svelte';
	import {
		deleteAddon,
		getActivity,
		getMe,
		getProduct,
		listActivityProducts,
		listAddons,
		saveAddon,
		saveProduct
	} from '$lib/api/admin';
	import { frontendError } from '$lib/api/client';
	import type { AdminProduct, AvailableAddon } from '$lib/api/types';
	import { validAddons } from '$lib/addon-validation';
	import AddonFields from './AddonFields.svelte';
	import { linkedAddons, productBody } from '$lib/product';
	import { toasts } from '$lib/toasts.svelte';
	import { localize, sortByLocalizedName } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { ArrowLeft, Trash2 } from '@lucide/svelte';

	let {
		id,
		activityId = '',
		productId = ''
	}: { id: string | null; activityId?: string; productId?: string } = $props();
	/** Add-ons belong to the activity (tickets) or to the product (item products). */
	const owner = $derived(activityId ? { activityId } : { productId });
	const backUrl = $derived(
		activityId
			? resolve('/activities/[id]?tab=tickets', { id: activityId })
			: productId
				? resolve('/products/[id]', { id: productId })
				: resolve('/')
	);
	let addon = $state<AvailableAddon | null>(null);
	let availableAddons = $state<AvailableAddon[]>([]);
	let loading = $state(true);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let canEdit = $state(false);
	let locked = $state(false);
	let assigned = $state(false);
	let products = $state<AdminProduct[]>([]);
	const sortedProducts = $derived(sortByLocalizedName(products, (product) => product.name));
	let selectedKindIds = $state<string[]>([]);
	let showErrors = $state(false);
	let snapshot = $state('');
	let allowNavigation = $state(false);
	let formElement = $state<HTMLFormElement>();
	const dirty = $derived(snapshot !== '' && serialize() !== snapshot);

	function serialize(): string {
		return JSON.stringify({ addon, selectedKindIds: [...selectedKindIds].sort() });
	}

	beforeNavigate(({ cancel, willUnload }) => {
		if (dirty && !allowNavigation && (willUnload || !confirm(m.unsaved_changes()))) cancel();
	});
	onMount(() => {
		void load();
	});

	async function load(): Promise<void> {
		try {
			if (!activityId && !productId) throw new Error(m.not_found());
			const [me, addons] = await Promise.all([getMe(), listAddons(owner)]);
			availableAddons = addons;
			let productList: AdminProduct[];
			if (activityId) {
				const activity = await getActivity(activityId);
				canEdit = me.admin_group_ids.some(
					(groupId) =>
						groupId === activity.sales_target_group_id ||
						activity.hosts.some((host) => host.id === groupId)
				);
				productList = await listActivityProducts(activityId);
			} else {
				const product = await getProduct(productId);
				canEdit = me.admin_group_ids.includes(product.group_id);
				productList = [product];
			}
			const linked = productList.filter((product) => product.addon_ids.includes(id ?? ''));
			products = productList.filter((product) => product.kind !== 'activityvisibility');
			selectedKindIds = linked.map((product) => product.id);
			assigned = linked.length > 0;
			locked = linked.some((product) => product.been_purchased);
			addon = id
				? (addons.find((item) => item.id === id) ?? null)
				: {
						id: crypto.randomUUID(),
						name: { sv: '', en: '' },
						required: false,
						multiple_alternatives: false,
						has_text_field: false,
						options: []
					};
			if (!addon) throw new Error(m.not_found());
			snapshot = serialize();
		} catch (cause) {
			error = frontendError(cause) ?? m.error_title();
		} finally {
			loading = false;
		}
	}

	async function save(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const currentAddon = $state.snapshot(addon);
		if (!currentAddon || !canEdit || saving) return;
		showErrors = true;
		if (!validAddons([currentAddon])) {
			error = m.ticket_addons_invalid();
			await tick();
			const invalid = formElement?.querySelector<HTMLElement>(
				'[aria-invalid="true"], .field-error input, .field-error select'
			);
			invalid?.focus();
			invalid?.scrollIntoView({ block: 'center', behavior: 'smooth' });
			return;
		}
		saving = true;
		error = null;
		try {
			await saveAddon(owner, currentAddon);
			for (const product of products) {
				const selected = selectedKindIds.includes(product.id);
				if (selected === product.addon_ids.includes(currentAddon.id)) continue;
				const current = await getProduct(product.id);
				const linked = linkedAddons(current, availableAddons).filter(
					(item) => item.id !== currentAddon.id
				);
				if (selected) linked.push(currentAddon);
				await saveProduct(product.id, productBody(current, linked), { notify: false });
				product.addon_ids = linked.map((entry) => entry.id);
				assigned = products.some((item) => item.addon_ids.includes(currentAddon.id));
			}
			snapshot = serialize();
			toasts.show('success', m.backend_success());
			if (!id) {
				allowNavigation = true;
				const query = activityId
					? `activity=${encodeURIComponent(activityId)}`
					: `product=${encodeURIComponent(productId)}`;
				await goto(resolve(`/addons/[id]?${query}`, { id: currentAddon.id }), {
					replaceState: true
				});
			}
		} catch (cause) {
			allowNavigation = false;
			error = frontendError(cause) ?? m.error_title();
		} finally {
			saving = false;
		}
	}

	async function remove(): Promise<void> {
		if (!id || !canEdit || assigned || saving || !confirm(m.delete_addon_confirm())) return;
		saving = true;
		try {
			await deleteAddon(id);
			allowNavigation = true;
			await goto(backUrl);
		} catch (cause) {
			allowNavigation = false;
			error = frontendError(cause) ?? m.error_title();
		} finally {
			saving = false;
		}
	}
</script>

<header class="page-header edit-page-header">
	<div>
		<p class="eyebrow">{m.addons()}</p>
		<h1>
			{id ? m.edit_addon() : m.new_addon()}{addon
				? ` · ${localize(addon.name, '').trim() || m.empty_addon()}`
				: ''}
		</h1>
	</div>
	<a class="button-link secondary" href={backUrl}><ArrowLeft size={18} /> {m.back()}</a>
</header>
{#if error}<p class="error-banner" role="alert">{error}</p>{/if}
{#if loading}<div class="center-stage">
		<div class="loader"></div>
		<p>{m.loading()}</p>
	</div>
{:else if addon}
	{#if !canEdit}<p class="info-banner">{m.activity_read_only()}</p>{/if}
	<form class="stack" novalidate onsubmit={save} bind:this={formElement}>
		<AddonFields
			{addon}
			disabled={!canEdit || saving}
			{locked}
			{showErrors}
			onchange={(value) => (addon = value)} />
		<section class="card card-pad stack">
			<h2 class="section-title">
				{activityId ? m.addon_ticket_kinds() : m.addon_products()}
			</h2>
			<p class="muted">
				{activityId ? m.addon_assignment_help() : m.addon_products_help()}
			</p>
			{#each sortedProducts as product (product.id)}
				<label class="switch-field">
					<input
						type="checkbox"
						checked={selectedKindIds.includes(product.id)}
						disabled={!canEdit || saving}
						onchange={(event) => {
							selectedKindIds = selectedKindIds.filter((kindId) => kindId !== product.id);
							if (event.currentTarget.checked) selectedKindIds = [...selectedKindIds, product.id];
						}} />
					<span>{localize(product.name)}</span>
				</label>
			{:else}<p class="empty-state">{m.empty()}</p>{/each}
		</section>
		<div class="editor-action-dock">
			<button class="button-link" type="submit" disabled={!canEdit || saving}
				>{saving ? m.saving() : m.save()}</button>
			{#if id}<button
					class="button-link secondary danger-button"
					type="button"
					disabled={!canEdit || saving || assigned}
					title={assigned ? m.unassign_addon_before_delete() : undefined}
					onclick={() => void remove()}><Trash2 size={17} /> {m.delete()}</button
				>{/if}
		</div>
	</form>
{/if}
