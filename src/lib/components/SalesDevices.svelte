<script lang="ts">
	import {
		createPhysicalSalesClient,
		deletePhysicalSalesClient,
		listPhysicalSalesClients
	} from '$lib/api/admin';
	import type { PhysicalSalesClient } from '$lib/api/types';
	import { frontendError } from '$lib/api/client';
	import { dateTime } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { toasts } from '$lib/toasts.svelte';
	import ExpirySelect from '$lib/components/ExpirySelect.svelte';
	import QRCode from 'qrcode';

	let {
		groupId = null,
		activityId = null,
		activityEnd = null,
		canEdit = false
	}: {
		groupId?: string | null;
		activityId?: string | null;
		/** Activity end time; enables the "until activity is over" preset. */
		activityEnd?: string | null;
		canEdit?: boolean;
	} = $props();

	let devices = $state<PhysicalSalesClient[]>([]);
	let name = $state('');
	/** Concrete expiry chosen in the duration dropdown, always a timestamp. */
	let until = $state<string | null>(null);
	let qr = $state<{ id: string; src: string } | null>(null);
	let saving = $state(false);
	let error = $state<string | null>(null);

	const target = $derived(
		groupId ? { group_id: groupId } : activityId ? { activity_id: activityId } : null
	);

	$effect(() => {
		const current = target;
		if (!current) return;
		void refresh(current);
	});

	async function refresh(current: { group_id?: string; activity_id?: string }): Promise<void> {
		try {
			devices = await listPhysicalSalesClients(
				current.group_id ? { group_id: current.group_id } : { activity_id: current.activity_id! }
			);
			error = null;
		} catch (cause) {
			error = frontendError(cause);
		}
	}

	async function showQr(id: string): Promise<void> {
		qr = { id, src: await QRCode.toDataURL(id, { width: 320, margin: 2 }) };
	}

	async function register(): Promise<void> {
		const current = target;
		if (!current || !name.trim()) return;
		saving = true;
		error = null;
		try {
			const id = crypto.randomUUID();
			await createPhysicalSalesClient({
				id,
				name: name.trim(),
				until: until ?? new Date().toISOString(),
				...(current.group_id
					? { group_id: current.group_id }
					: { activity_id: current.activity_id })
			});
			await showQr(id);
			name = '';
			await refresh(current);
			toasts.show('success', m.backend_success());
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			saving = false;
		}
	}

	async function remove(id: string): Promise<void> {
		const current = target;
		if (!current || !confirm(m.delete_sales_device())) return;
		try {
			await deletePhysicalSalesClient(id);
			if (qr?.id === id) qr = null;
			await refresh(current);
			toasts.show('success', m.backend_success());
		} catch (cause) {
			error = frontendError(cause);
		}
	}
</script>

<section class="card card-pad stack">
	<div>
		<h2 class="section-title">{m.physical_sales_devices()}</h2>
		<p class="muted">{m.physical_sales_device_help()}</p>
	</div>
	{#if error}<p class="error-banner" role="alert">{error}</p>{/if}
	{#if canEdit}
		<div class="grid-2">
			<label class="field"
				><span>{m.sales_device_name()}</span>
				<input type="text" bind:value={name} /></label>
			<ExpirySelect {activityEnd} onchange={(value) => (until = value)} />
		</div>
		<button
			class="button-link"
			type="button"
			disabled={saving || !name.trim()}
			onclick={() => void register()}>{m.register_sales_device()}</button>
	{/if}
	{#if qr}
		<div class="stack">
			<h3>{m.sales_device_qr()}</h3>
			<img src={qr.src} alt={m.sales_device_qr()} class="qr-code" />
			<code class="mono">{qr.id}</code>
		</div>
	{/if}
	{#if devices.length === 0}
		<p class="empty-state">{m.empty()}</p>
	{:else}
		<ul class="list">
			{#each devices as device (device.id)}
				<li>
					<div class="list-main">
						<strong>{device.name}</strong>
						<span>{m.sales_device_until()} {dateTime(device.until)}</span>
					</div>
					<div class="toolbar">
						<button
							class="button-link secondary"
							type="button"
							onclick={() => void showQr(device.id)}>{m.sales_device_qr()}</button>
						{#if canEdit}
							<button
								class="button-link secondary danger-button"
								type="button"
								onclick={() => void remove(device.id)}>{m.delete_sales_device()}</button>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.qr-code {
		width: 220px;
		height: 220px;
		image-rendering: pixelated;
		background: white;
		padding: 0.5rem;
		border-radius: 0.5rem;
	}
</style>
