<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		deleteProduct,
		getProduct,
		listActivities,
		unlinkActivityItem,
		getActivity,
		listActivityProducts,
		listAddons,
		listGroupProducts,
		listGroupTree,
		listProductTags,
		listSalesTargets,
		saveAddon,
		saveProduct
	} from '$lib/api/admin';
	import { frontendError } from '$lib/api/client';
	import type {
		AdminProduct,
		AdminProductTag,
		AdminSalesTarget,
		AvailableAddon,
		BriefActivity,
		Group,
		PutProduct
	} from '$lib/api/types';
	import DateTimePicker from '$lib/components/DateTimePicker.svelte';
	import GroupTreePicker from '$lib/components/GroupTreePicker.svelte';
	import LocalizedField from '$lib/components/LocalizedField.svelte';
	import MoneyInput from '$lib/components/MoneyInput.svelte';
	import { copiedLocalizedTitle, kronor, localize, sortByLocalizedName } from '$lib/i18n';
	import { uploadImage } from '$lib/image';
	import * as m from '$lib/paraglide/messages';
	import { emptyProduct, linkedAddons, productBody } from '$lib/product';
	import { createDietaryPreferencesAddon } from '$lib/ticket-presets';
	import {
		defaultTransferGroups,
		sameGroups,
		TRANSFER_START,
		TRANSFER_STOP
	} from '$lib/transfer-settings';
	import { toasts } from '$lib/toasts.svelte';
	import { ArrowLeft, Plus, Trash2 } from '@lucide/svelte';
	import { Select, Switch } from '@svar-ui/svelte-core';

	let {
		id,
		activityId,
		/** Existing product to prefill a new one from. */
		copyId = null,
		/** The activity's placeholder product (`activity_visibility`) becomes a real ticket on save. */
		convertToTicket = false
	}: {
		id: string | null;
		activityId: string;
		copyId?: string | null;
		convertToTicket?: boolean;
	} = $props();

	let loading = $state(true);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let invalidField = $state<string | null>(null);
	let groups = $state<Group[]>([]);
	let salesTargets = $state<AdminSalesTarget[]>([]);
	let productTags = $state<AdminProductTag[]>([]);
	let availableAddons = $state<AvailableAddon[]>([]);
	/** Activity whose add-on set this product draws from (empty for item products). */
	let addonActivityId = $state('');
	let groupProducts = $state<AdminProduct[]>([]);
	let original = $state<AdminProduct | null>(null);
	let form = $state<PutProduct>(emptyProduct());
	let savedSnapshot = $state('');
	let allowNavigation = $state(false);
	let baseGroups = $state<string[]>([]);
	// True when the recipient groups differ from the base ticket's buyers (shown as a hint).
	let transferCustomized = $state(false);
	// The activity's base ticket (open to everyone who can see the activity); other kinds are reserved.
	let isBaseTicket = $state(false);

	const isTicket = $derived(form.kind === 'ticket');
	/** `i32::MAX` — anything above 1e9 means "unlimited stock". Tickets always sell a fixed count. */
	const INFINITE_STOCK = 2_147_483_647;
	const infiniteStock = $derived(!isTicket && (form.sales_stock ?? 0) > 1_000_000_000);
	/** A zero-length transfer window means transfers are turned off. */
	const transfersEnabled = $derived(
		new Date(form.resale_stop).getTime() > new Date(form.resale_start).getTime()
	);
	const managedStock = $derived(form.sales_stock !== undefined);
	const salesStartLocked = $derived(Boolean(original?.tickets_been_released));
	const salesTargetOptions = $derived(
		salesTargets.map((target) => ({
			id: target.id,
			label: `${target.group_path} · ${localize(target.group_name, '')}`
		}))
	);
	const ownerGroupId = $derived(
		salesTargets.find((target) => target.id === form.sales_target_id)?.group_id ?? ''
	);
	const duplicateInternalIds = $derived.by(() => {
		const internalId = form.store_internal_id?.trim();
		if (!internalId) return [];
		return groupProducts.filter(
			(product) => product.id !== id && product.store_internal_id?.trim() === internalId
		);
	});
	$effect(() => {
		const group = ownerGroupId;
		if (!group) return;
		listGroupProducts(group)
			.then((list) => (groupProducts = list))
			.catch(() => (groupProducts = []));
	});
	const sortedAddons = $derived(sortByLocalizedName(availableAddons, (addon) => addon.name));
	/** The product's price is split over product tags on its base-price add-on. */
	const productTagOptions = $derived(
		productTags.map((tag) => ({
			id: tag.id,
			label: `${tag.group_path} · ${localize(tag.name, '') || tag.id}`
		}))
	);
	const bookkeepingTotal = $derived(
		form.bookkeeping_prices.reduce((sum, price) => sum + (Number.isFinite(price) ? price : 0), 0)
	);
	const bookkeepingValid = $derived(
		form.bookkeeping_tag_ids.length === form.bookkeeping_prices.length &&
			form.bookkeeping_tag_ids.every(Boolean) &&
			form.bookkeeping_prices.every((price) => Number.isSafeInteger(price) && price >= 0) &&
			bookkeepingTotal === form.price
	);
	/** Add-ons live on the activity's set (tickets) or on the product's own set (items). */
	const addonOwner = $derived(
		addonActivityId ? { activityId: addonActivityId } : original ? { productId: original.id } : null
	);
	const hasDietaryPreferences = $derived(
		availableAddons.some((addon) => addon.name.sv.trim().toLocaleLowerCase() === 'matpreferens')
	);
	const dirty = $derived(savedSnapshot !== '' && serialize() !== savedSnapshot);
	/** Activities the product is linked to, with titles, to explain the link and allow removing it. */
	let activityTitles = $state<BriefActivity[]>([]);
	const linkedActivities = $derived(
		form.activity_ids.map((activityId) => ({
			id: activityId,
			title: activityTitles.find((activity) => activity.id === activityId)?.title ?? {}
		}))
	);
	/** Where the back button goes: the activity this product belongs to, if any. */
	const backActivityId = $derived(activityId || (form.activity_ids[0] ?? ''));
	/** Picture shown for the current image id (either the stored one or a fresh upload). */
	const imageUrl = $derived(
		original?.image_url && original.image_id === form.image_id ? original.image_url : null
	);

	beforeNavigate(({ cancel, willUnload }) => {
		if (!dirty || allowNavigation) return;
		if (willUnload) {
			cancel();
			return;
		}
		if (!confirm(m.unsaved_changes())) cancel();
	});

	$effect(() => {
		const identity = { id, activityId, copyId };
		void load(identity.id, identity.activityId, identity.copyId);
	});

	function setBookkeeping(tagIds: string[], prices: number[]): void {
		update({ bookkeeping_tag_ids: tagIds, bookkeeping_prices: prices });
	}

	function setPrice(price: number): void {
		// A single tag always carries the whole price; a split is left alone.
		if (form.bookkeeping_prices.length > 1) {
			update({ price });
			return;
		}
		const tagId = form.bookkeeping_tag_ids[0] ?? defaultBookkeepingTag(productTags);
		// A free product may book nothing at all, which is all that is possible without tags.
		if (!tagId) {
			update({ price });
			return;
		}
		setBookkeeping([tagId], [price]);
	}

	/** Bookkeeping tags whose name mentions tickets, longest first. */
	function defaultBookkeepingTag(tags: AdminProductTag[]): string {
		const nameOf = (tag: AdminProductTag): string =>
			[tag.name.sv, tag.name.en].filter(Boolean).join(' ');
		const ticketTags = tags.filter((tag) => /ticket|biljett/i.test(nameOf(tag)));
		const pool = ticketTags.length > 0 ? ticketTags : tags;
		return [...pool].sort((left, right) => nameOf(right).length - nameOf(left).length)[0]?.id ?? '';
	}

	function setTransfers(enabled: boolean): void {
		update(
			enabled
				? { resale_start: TRANSFER_START, resale_stop: TRANSFER_STOP }
				: { resale_start: TRANSFER_START, resale_stop: TRANSFER_START }
		);
	}

	function serialize(): string {
		return JSON.stringify(form);
	}

	async function load(
		productId: string | null,
		linkedActivityId: string,
		copiedProductId: string | null = null
	): Promise<void> {
		loading = true;
		error = null;
		try {
			const [groupTree, targets, tags, briefs] = await Promise.all([
				listGroupTree(),
				listSalesTargets(),
				listProductTags(),
				listActivities()
			]);
			activityTitles = briefs;
			groups = groupTree;
			salesTargets = targets;
			productTags = tags;
			form = emptyProduct(targets[0]?.id ?? '', linkedActivityId || undefined);
			original = null;
			let effectiveActivityId = linkedActivityId;
			let copiedSource: AdminProduct | null = null;
			if (copiedProductId) {
				// Duplicating keeps the owner, links and prices; the name is marked so the copy is
				// recognizable.
				copiedSource = await getProduct(copiedProductId);
				effectiveActivityId = copiedSource.activity_ids[0] ?? '';
				form = { ...productBody(copiedSource, []), name: copiedLocalizedTitle(copiedSource.name) };
			} else if (productId) {
				const product = await getProduct(productId);
				original = product;
				effectiveActivityId = product.activity_ids[0] ?? '';
				form = productBody(product, []);
			}
			baseGroups = [];
			addonActivityId = effectiveActivityId;
			if (effectiveActivityId) {
				const [activity, products, addons] = await Promise.all([
					getActivity(effectiveActivityId),
					listActivityProducts(effectiveActivityId),
					listAddons({ activityId: effectiveActivityId })
				]);
				availableAddons = addons;
				const base = products.find((product) => product.id === activity.base_ticket);
				isBaseTicket = original?.id === activity.base_ticket;
				baseGroups = [...(base?.allowed_group_ids ?? [])];
				if (original) {
					form = productBody(original, linkedAddons(original, addons));
					if (convertToTicket && original.kind === 'activityvisibility') {
						form = { ...form, kind: 'ticket', max_uses: 1, stock_unit: 'st' };
					}
				} else if (copiedSource) form.addons = linkedAddons(copiedSource, addons);
				else {
					form.sales_target_id = base?.sales_target_id ?? form.sales_target_id;
					form.tickets_guaranteed = !isBaseTicket;
					form.transfer_group_ids = defaultTransferGroups(baseGroups);
				}
			} else {
				availableAddons = productId ? await listAddons({ productId }) : [];
			}
			if (!original && !copiedSource) {
				const defaultTag = defaultBookkeepingTag(productTags);
				if (defaultTag) {
					form.bookkeeping_tag_ids = [defaultTag];
					form.bookkeeping_prices = [form.price];
				}
			}
			transferCustomized = !sameGroups(form.transfer_group_ids, baseGroups);
			savedSnapshot = serialize();
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			loading = false;
		}
	}

	function update(change: Partial<PutProduct>): void {
		form = { ...form, ...change };
	}

	async function chooseImage(event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		error = null;
		try {
			update({ image_id: await uploadImage(file) });
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			input.value = '';
		}
	}

	/** Unlinks the product from the activity right away; existing purchases stay untouched. */
	async function unlinkActivity(linkedActivityId: string): Promise<void> {
		if (!id || !confirm(m.product_unlink_activity_confirm())) return;
		error = null;
		try {
			await unlinkActivityItem(linkedActivityId, id);
			update({ activity_ids: form.activity_ids.filter((item) => item !== linkedActivityId) });
			original = original ? { ...original, activity_ids: form.activity_ids } : original;
			savedSnapshot = serialize();
		} catch (cause) {
			error = frontendError(cause);
		}
	}

	function isWithinBase(groupId: string): boolean {
		const group = groups.find((item) => item.id === groupId);
		return baseGroups.some((baseId) => {
			if (baseId === groupId) return true;
			const base = groups.find((item) => item.id === baseId);
			return !!group && !!base && group.path.startsWith(`${base.path}.`);
		});
	}

	function validate(): string | null {
		if (!form.name.sv.trim() || !form.name.en.trim()) return m.required_fields();
		if (!Number.isSafeInteger(form.price) || form.price < 0) return m.money_input_invalid();
		if (!form.sales_target_id) return m.required_fields();
		if (!bookkeepingValid) return m.addon_bookkeeping_invalid();
		if (new Date(form.sales_stop) <= new Date(form.sales_start)) return m.ticket_dates_order();
		if (transfersEnabled && new Date(form.resale_stop) <= new Date(form.resale_start)) {
			return m.ticket_dates_order();
		}
		if (form.max_uses < 1) return m.required_fields();
		if (isTicket && form.allowed_group_ids.some((groupId) => !isWithinBase(groupId)))
			return m.ticket_groups_subset_error();
		return null;
	}

	/** Creates a text-only dietary-preference add-on and links it to this product. */
	async function addDietaryPreferences(): Promise<void> {
		if (!addonOwner || saving) return;
		saving = true;
		error = null;
		try {
			const addon = createDietaryPreferencesAddon(availableAddons);
			await saveAddon(addonOwner, addon);
			availableAddons = [...availableAddons, addon];
			update({ addons: [...form.addons, structuredClone(addon)] });
			toasts.show('success', m.backend_success());
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			saving = false;
		}
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		saving = true;
		error = null;
		try {
			const issue = validate();
			if (issue) {
				error = issue;
				toasts.show('error', issue);
				return;
			}
			const productId = id ?? crypto.randomUUID();
			const body = $state.snapshot(form);
			if (isTicket) {
				body.sales_stock ??= 0;
				body.stock_unit = 'st';
				body.max_uses = 1;
				body.tickets_guaranteed = !isBaseTicket;
			}
			await saveProduct(productId, body);
			form = body;
			savedSnapshot = serialize();
			if (!id) {
				allowNavigation = true;
				await goto(resolve('/products/[id]', { id: productId }), { replaceState: true });
			}
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			saving = false;
		}
	}

	async function remove(): Promise<void> {
		if (!id || !confirm(m.delete_product_confirm())) return;
		saving = true;
		error = null;
		try {
			await deleteProduct(id);
			allowNavigation = true;
			await goto(
				backActivityId
					? resolve('/activities/[id]?tab=tickets', { id: backActivityId })
					: resolve('/products')
			);
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			saving = false;
		}
	}
</script>

<header class="page-header edit-page-header">
	<div>
		<p class="eyebrow">{m.products()}</p>
		<h1>{m.product()} · {localize(form.name, '').trim() || m.empty_product()}</h1>
	</div>
	<div class="toolbar">
		<a
			class="button-link secondary"
			href={backActivityId
				? resolve('/activities/[id]?tab=tickets', { id: backActivityId })
				: resolve('/products')}><ArrowLeft size={18} /> {m.back()}</a>
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

		<section class="card card-pad stack">
			<h2>{m.product_type_and_owner()}</h2>
			<div class="grid-2">
				<p>{m.product_kind()}: {isTicket ? m.product_kind_ticket() : m.product_kind_normal()}</p>
				<label class="field"
					><span>{m.sales_target()}</span>
					<Select
						value={form.sales_target_id}
						options={salesTargetOptions}
						onchange={({ value }) => update({ sales_target_id: String(value) })} /></label>
			</div>
			{#if linkedActivities.length === 0}
				<p class="muted">{m.store_product()}</p>
			{:else}
				<ul class="list">
					{#each linkedActivities as activity (activity.id)}
						<li>
							<div class="list-main">
								<strong>{localize(activity.title, '') || activity.id}</strong>
							</div>
							{#if id && !isTicket}
								<button
									class="button-link secondary danger-button"
									type="button"
									disabled={saving}
									onclick={() => void unlinkActivity(activity.id)}>
									{m.product_unlink_activity()}
								</button>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="card card-pad stack">
			<h2>{m.details()}</h2>
			<LocalizedField
				value={form.name}
				labelSv={m.name_sv()}
				labelEn={m.name_en()}
				required
				onchange={(name) => update({ name })} />
			<LocalizedField
				value={form.description}
				labelSv={m.description_sv()}
				labelEn={m.description_en()}
				multiline
				onchange={(description) => update({ description })} />
			<div class="field">
				<span>{m.product_picture()}</span>
				{#if imageUrl}
					<img class="product-picture" src={imageUrl} alt={m.product_picture()} />
				{/if}
				<input
					type="file"
					accept="image/jpeg,image/png,image/webp,image/avif,image/svg+xml"
					onchange={(event) => void chooseImage(event)} />
				{#if form.image_id && !imageUrl}<span class="success-banner">{m.image_ready()}</span>{/if}
				{#if form.image_id}
					<button
						class="button-link secondary"
						type="button"
						onclick={() => update({ image_id: undefined })}>{m.product_picture_remove()}</button>
				{/if}
			</div>
			<MoneyInput
				label={m.base_price()}
				value={form.price}
				onchange={(price) => setPrice(price ?? 0)} />
		</section>

		<section class="card card-pad stack">
			<h2>{m.sales_window()}</h2>
			<div class="date-range">
				<DateTimePicker
					label={m.available_from()}
					value={form.sales_start}
					disabled={salesStartLocked}
					onchange={(sales_start) => update({ sales_start })} />
				<DateTimePicker
					label={m.available_until()}
					value={form.sales_stop}
					error={new Date(form.sales_stop) <= new Date(form.sales_start)}
					onchange={(sales_stop) => update({ sales_stop })} />
			</div>
			{#if salesStartLocked}<p class="muted">{m.sales_start_locked()}</p>{/if}
		</section>

		<section class="card card-pad stack">
			<h2>{m.transfer_settings()}</h2>
			{#if isTicket}
				<label class="switch-field">
					<Switch value={transfersEnabled} onchange={({ value }) => setTransfers(value)} />
					<span>{m.allow_transfers()}</span>
				</label>
			{/if}
			{#if transfersEnabled}
				<div class="date-range">
					<DateTimePicker
						label={m.transfer_from()}
						value={form.resale_start}
						onchange={(resale_start) => update({ resale_start })} />
					<DateTimePicker
						label={m.transfer_until()}
						value={form.resale_stop}
						error={new Date(form.resale_stop) <= new Date(form.resale_start)}
						onchange={(resale_stop) => update({ resale_stop })} />
				</div>
				{#if !isTicket}
					<GroupTreePicker
						title={m.transfer_groups()}
						{groups}
						selectedIds={form.transfer_group_ids}
						inheritDescendants
						onchange={(transfer_group_ids) => update({ transfer_group_ids })} />
					<p class="muted">{m.transfer_groups_descendants()}</p>
				{:else}
					<p class="muted">{m.transfer_defaults_explanation()}</p>
					{#if transferCustomized}
						<GroupTreePicker
							title={m.transfer_groups()}
							{groups}
							selectedIds={form.transfer_group_ids}
							inheritDescendants
							onchange={(transfer_group_ids) => update({ transfer_group_ids })} />
						<p class="muted">{m.transfer_groups_descendants()}</p>
						<button
							class="button-link secondary"
							type="button"
							onclick={() => {
								update({ transfer_group_ids: defaultTransferGroups(baseGroups) });
								transferCustomized = false;
							}}>{m.reset_transfer_groups()}</button>
					{:else}
						<p>{m.transfer_groups_using_defaults()}</p>
						<button
							class="button-link secondary"
							type="button"
							onclick={() => (transferCustomized = true)}>{m.customize_transfers()}</button>
					{/if}
				{/if}
			{:else}
				<p class="muted">{m.transfers_disabled_help()}</p>
			{/if}
		</section>

		<section class="card card-pad stack">
			<h2>{m.stock()}</h2>
			{#if isTicket}<p class="muted">{m.ticket_settings_stock_help()}</p>{/if}
			{#if !isTicket}
				<label class="switch-field">
					<Switch
						value={managedStock}
						onchange={({ value }) =>
							update({ sales_stock: value ? Math.max(form.sales_stock ?? 0, 0) : undefined })} />
					<span>{m.stock_managed()}</span>
				</label>
			{/if}
			{#if managedStock && !isTicket}
				<label class="switch-field" title={m.stock_infinite_help()}>
					<Switch
						value={infiniteStock}
						onchange={({ value }) => update({ sales_stock: value ? INFINITE_STOCK : 0 })} />
					<span>{m.stock_infinite()}</span>
				</label>
				<small class="muted">{m.stock_infinite_help()}</small>
			{/if}
			<div class="grid-2">
				{#if managedStock || isTicket}
					<label class="field"
						><span
							>{m.stock_available_units({ unit: isTicket ? 'st' : form.stock_unit || 'st' })}</span>
						<input
							type="number"
							min="0"
							disabled={infiniteStock}
							value={form.sales_stock ?? 0}
							oninput={(event) =>
								update({ sales_stock: event.currentTarget.valueAsNumber })} /></label>
				{/if}
				{#if !isTicket}
					<label class="field"
						><span>{m.stock_real()}</span>
						<input type="number" bind:value={form.stock_real} /></label>
					<label class="field"
						><span>{m.stock_unit()}</span>
						<input type="text" bind:value={form.stock_unit} /></label>
					<MoneyInput
						label={m.value_per_unit()}
						suffix={m.currency_per_unit({ unit: form.stock_unit || 'st' })}
						value={form.stock_price}
						onchange={(stock_price) => update({ stock_price: stock_price ?? 0 })} />
					<label class="field"
						><span>{m.max_uses()}</span>
						<input type="number" min="1" bind:value={form.max_uses} /></label>
				{/if}
			</div>
		</section>

		<section class="card card-pad stack">
			<h2>{isTicket ? m.store_physical_sales() : m.store_and_bookkeeping()}</h2>
			<div class="toolbar between">
				<div>
					<h3 class="section-title">{m.bookkeeping()}</h3>
					<p class="muted">{m.bookkeeping_report_help()}</p>
					<p class="muted">
						{m.bookkeeping_total({ total: kronor(bookkeepingTotal), price: kronor(form.price) })}
					</p>
				</div>
				{#if isTicket || form.bookkeeping_tag_ids.length === 0}
					<button
						type="button"
						class="button-link secondary"
						disabled={saving || productTags.length === 0}
						onclick={() =>
							setBookkeeping(
								[
									...form.bookkeeping_tag_ids,
									form.bookkeeping_tag_ids[0] ?? defaultBookkeepingTag(productTags)
								],
								[...form.bookkeeping_prices, 0]
							)}><Plus size={16} />{m.add_bookkeeping_category()}</button>
				{/if}
			</div>
			{#if !bookkeepingValid}<p class="muted">{m.addon_bookkeeping_invalid()}</p>{/if}
			{#each form.bookkeeping_tag_ids as tagId, index (index)}
				<div class="bookkeeping-row">
					<Select
						value={tagId}
						options={productTagOptions}
						onchange={({ value }) =>
							setBookkeeping(
								form.bookkeeping_tag_ids.map((item, i) => (i === index ? String(value) : item)),
								form.bookkeeping_prices
							)} />
					<MoneyInput
						label={m.bookkeeping_amount()}
						value={form.bookkeeping_prices[index]}
						onchange={(price) =>
							setBookkeeping(
								form.bookkeeping_tag_ids,
								form.bookkeeping_prices.map((item, i) =>
									i === index ? (price ?? Number.NaN) : item
								)
							)} />
					{#if isTicket && form.bookkeeping_tag_ids.length > 1}
						<button
							type="button"
							class="icon-button danger-button"
							aria-label={m.remove()}
							disabled={saving}
							onclick={() =>
								setBookkeeping(
									form.bookkeeping_tag_ids.filter((_, i) => i !== index),
									form.bookkeeping_prices.filter((_, i) => i !== index)
								)}><Trash2 size={16} /></button>
					{/if}
				</div>
			{/each}
			<div class="switch-group">
				<label class="switch-field">
					<Switch
						value={form.store_general_sales}
						onchange={({ value }) => update({ store_general_sales: value })} />
					<span>{isTicket ? m.store_physical_sales() : m.store_general_sales()}</span>
				</label>
				{#if !isTicket}
					<label class="switch-field">
						<Switch
							value={form.store_online_self_serve}
							onchange={({ value }) => update({ store_online_self_serve: value })} />
						<span>{m.store_online_self_serve()}</span>
					</label>
				{/if}
			</div>
			{#if !isTicket}<div class="grid-2">
					<label class="field"
						><span>{m.store_internal_id()}</span>
						<input type="text" bind:value={form.store_internal_id} />
						{#if duplicateInternalIds.length > 0}
							<small class="field-warning" role="alert"
								>{m.store_internal_id_duplicate({
									names: duplicateInternalIds
										.map((product) => localize(product.name, '') || product.id)
										.join(', ')
								})}</small>
						{/if}</label>
					<label class="field"
						><span>{m.store_alcohol_by_volume()}</span>
						<input type="number" min="0" bind:value={form.store_alcohol_by_volume} /></label>
				</div>{/if}
		</section>

		{#if isTicket}
			<section class="card card-pad stack">
				<h2>{m.ticket_settings()}</h2>
				{#if !isBaseTicket}
					<p class="info-banner" role="status">{m.tickets_reserved_help()}</p>
				{/if}
				<label class="switch-field">
					<Switch
						value={form.tickets_require_other}
						onchange={({ value }) => update({ tickets_require_other: value })} />
					<span>{m.tickets_require_other()}</span>
				</label>
				<small class="muted">{m.tickets_require_other_help()}</small>
			</section>
		{/if}

		<section class="card card-pad stack">
			{#if isTicket || form.store_online_self_serve}
				<GroupTreePicker
					title={m.allowed_groups()}
					{groups}
					selectedIds={form.allowed_group_ids}
					error={invalidField === m.allowed_groups()}
					onchange={(allowed_group_ids) => update({ allowed_group_ids })} />
				<p class="muted">{m.allowed_groups_help()}</p>
			{:else}
				<p class="muted">{m.allowed_groups_self_serve_help()}</p>
			{/if}
		</section>

		<section class="card card-pad stack">
			<div class="section-heading">
				<h2>{m.addons()}</h2>
				{#if addonOwner}
					<a
						class="button-link secondary"
						href={addonOwner.activityId
							? resolve(`/addons/new?activity=${addonOwner.activityId}`)
							: resolve(`/addons/new?product=${addonOwner.productId}`)}>{m.new_addon()}</a>
					{#if !hasDietaryPreferences}
						<button
							class="button-link secondary"
							type="button"
							disabled={saving}
							onclick={() => void addDietaryPreferences()}>{m.add_dietary_preferences()}</button>
					{/if}
				{/if}
			</div>
			{#each sortedAddons as addon (addon.id)}
				<label class="switch-field">
					<input
						type="checkbox"
						checked={form.addons.some((item) => item.id === addon.id)}
						onchange={(event) => {
							const checked = event.currentTarget.checked;
							const remaining = form.addons.filter((item) => item.id !== addon.id);
							update({
								addons: checked ? [...remaining, structuredClone(addon)] : remaining
							});
						}} />
					<span>{localize(addon.name)}</span>
				</label>
			{:else}
				<p class="empty-state">
					{addonOwner ? m.empty() : m.addons_save_product_first()}
				</p>
			{/each}
		</section>

		<div class="editor-action-dock">
			<button class="button-link" type="submit" disabled={saving}
				>{saving ? m.saving() : m.save()}</button>
			{#if id}
				{@const duplicateUrl = `${resolve('/products/new')}?copy=${id}`}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the route is resolved, the query is appended -->
				<a class="button-link secondary" href={duplicateUrl}>{m.product_duplicate()}</a>
				<button
					class="button-link secondary danger-button"
					type="button"
					disabled={saving}
					onclick={() => void remove()}>
					<Trash2 size={17} />
					{m.delete_product()}
				</button>
			{/if}
		</div>
	</form>
{/if}

<style>
	.product-picture {
		max-width: 220px;
		border-radius: 0.5rem;
	}
</style>
