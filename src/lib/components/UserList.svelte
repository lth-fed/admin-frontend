<script lang="ts">
	import type { AdminUser } from '$lib/api/types';
	import * as m from '$lib/paraglide/messages';
	let {
		title,
		items,
		suggestions = [],
		allowEmailInvite = false,
		addLabel = m.user_id(),
		addText = m.add(),
		removeText = m.remove(),
		onadd,
		onremove
	}: {
		title: string;
		items: Array<string | AdminUser>;
		suggestions?: AdminUser[];
		allowEmailInvite?: boolean;
		addLabel?: string;
		addText?: string;
		removeText?: string;
		onadd: (value: string) => Promise<void>;
		onremove?: (value: string) => Promise<void>;
	} = $props();
	let value = $state('');
	let busy = $state(false);
	const suggestionsId = `users-${crypto.randomUUID()}`;
	const trimmedValue = $derived(value.trim());
	const emailValue = $derived(
		allowEmailInvite && !trimmedValue.startsWith('email:') && /^\S+@\S+\.\S+$/.test(trimmedValue)
			? `email:${trimmedValue}`
			: null
	);
	const invitesNewEmail = $derived(
		emailValue !== null && !suggestions.some((user) => user.user_id === emailValue)
	);

	function userId(item: string | AdminUser): string {
		return typeof item === 'string' ? item : item.user_id;
	}

	function userName(item: string | AdminUser): string | undefined {
		return typeof item === 'string' ? undefined : item.name;
	}

	async function add(): Promise<void> {
		if (!trimmedValue) return;
		busy = true;
		try {
			await onadd(emailValue ?? trimmedValue);
			value = '';
		} finally {
			busy = false;
		}
	}
</script>

<div>
	<h3 class="section-title">{title}</h3>
	<div class="toolbar">
		<label class="field" style="flex: 1"
			><span>{addLabel}</span><input bind:value list={suggestionsId} autocomplete="off" /></label
		><datalist id={suggestionsId}>
			{#each suggestions as suggestion (suggestion.user_id)}
				<option value={suggestion.user_id}>{suggestion.name ?? suggestion.user_id}</option>
			{/each}
		</datalist><button
			class="button-link secondary"
			type="button"
			disabled={busy || !trimmedValue}
			onclick={() => void add()}>{invitesNewEmail ? m.invite_user() : addText}</button>
	</div>
	{#if items.length === 0}<p class="muted">{m.empty()}</p>{:else}<ul class="list">
			{#each items as item (userId(item))}<li>
					<div class="list-main">
						{#if userName(item)}<strong>{userName(item)}</strong>{/if}
						<code>{userId(item)}</code>
					</div>
					{#if onremove}<button
							class="button-link secondary danger-button"
							type="button"
							onclick={() => void onremove?.(userId(item))}>{removeText}</button
						>{/if}
				</li>{/each}
		</ul>{/if}
</div>
