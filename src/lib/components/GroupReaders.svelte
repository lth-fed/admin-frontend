<script lang="ts">
	import {
		deleteGroupReader,
		listGroupReaders,
		pairGroupReader,
		updateGroupReader,
		type GroupReader
	} from '$lib/api/admin';
	import { frontendError } from '$lib/api/client';
	import { localize } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { toasts } from '$lib/toasts.svelte';

	let { groupId, canEdit }: { groupId: string; canEdit: boolean } = $props();

	let readers = $state<GroupReader[]>([]);
	let pairingCode = $state('');
	let name = $state('');
	let saving = $state(false);
	let editing = $state<{ id: string; name: string } | null>(null);
	let error = $state<string | null>(null);

	$effect(() => {
		const id = groupId;
		void refresh(id);
	});

	async function refresh(id: string): Promise<void> {
		try {
			readers = await listGroupReaders(id);
			error = null;
		} catch (cause) {
			error = frontendError(cause);
		}
	}

	async function pair(): Promise<void> {
		if (!pairingCode.trim() || !name.trim()) return;
		saving = true;
		error = null;
		try {
			await pairGroupReader(groupId, {
				pairing_code: pairingCode.trim(),
				name: name.trim()
			});
			pairingCode = '';
			name = '';
			await refresh(groupId);
			toasts.show('success', m.backend_success());
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			saving = false;
		}
	}

	async function saveName(): Promise<void> {
		if (!editing) return;
		const next = { ...editing };
		editing = null;
		try {
			await updateGroupReader(next.id, { name: next.name.trim() });
			await refresh(groupId);
			toasts.show('success', m.backend_success());
		} catch (cause) {
			error = frontendError(cause);
		}
	}

	async function remove(id: string): Promise<void> {
		if (!confirm(m.delete_reader_confirm())) return;
		try {
			await deleteGroupReader(id);
			await refresh(groupId);
			toasts.show('success', m.backend_success());
		} catch (cause) {
			error = frontendError(cause);
		}
	}
</script>

<section class="card card-pad stack">
	<div>
		<h2 class="section-title">{m.readers()}</h2>
		<p class="muted">{m.readers_help()}</p>
	</div>
	{#if error}<p class="error-banner" role="alert">{error}</p>{/if}

	{#if canEdit}
		<div class="grid-2">
			<label class="field"
				><span>{m.reader_pairing_code()}</span>
				<input type="text" bind:value={pairingCode} placeholder="12345678" /></label>
			<label class="field"
				><span>{m.reader_name()}</span>
				<input type="text" bind:value={name} /></label>
		</div>
		<button
			class="button-link"
			type="button"
			disabled={saving || !pairingCode.trim() || !name.trim()}
			onclick={() => void pair()}>{m.pair_reader()}</button>
	{/if}

	{#if readers.length === 0}
		<p class="empty-state">{m.empty()}</p>
	{:else}
		<ul class="list">
			{#each readers as reader (reader.id)}
				<li>
					<div class="list-main">
						{#if editing?.id === reader.id}
							<input type="text" bind:value={editing.name} aria-label={m.reader_name()} />
						{:else}
							<strong>{reader.name}</strong>
						{/if}
						<span>
							{reader.status}
							{#if reader.device}· {reader.device.model} ({reader.device.identifier}){/if}
							· {localize(reader.group_name, reader.group_path)}
						</span>
					</div>
					{#if canEdit}
						<div class="toolbar">
							{#if editing?.id === reader.id}
								<button class="button-link secondary" type="button" onclick={() => void saveName()}
									>{m.save()}</button>
								<button class="button-link secondary" type="button" onclick={() => (editing = null)}
									>{m.cancel()}</button>
							{:else}
								<button
									class="button-link secondary"
									type="button"
									onclick={() => (editing = { id: reader.id, name: reader.name })}
									>{m.edit()}</button>
								<button
									class="button-link secondary danger-button"
									type="button"
									onclick={() => void remove(reader.id)}>{m.delete_reader()}</button>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>
