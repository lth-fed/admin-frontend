<script lang="ts">
	import type { AdminUser } from '$lib/api/types';
	import * as m from '$lib/paraglide/messages';
	import { Combo } from '@svar-ui/svelte-core';
	import type { Component, Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type UserOption = { id: string; label: string; user: AdminUser; createUserId?: string };
	const UserCombo = Combo as Component<{
		value?: string;
		options?: UserOption[];
		clear?: boolean;
		children?: Snippet<[{ option: UserOption }]>;
	}>;
	let {
		title,
		count,
		items,
		suggestions = [],
		allowEmailInvite = false,
		allowLuId = false,
		addLabel = m.user_id(),
		addText = m.add(),
		removeText = m.remove(),
		onadd,
		onremove,
		...rest
	}: {
		title: string;
		count?: number;
		items: Array<string | AdminUser>;
		suggestions?: AdminUser[];
		allowEmailInvite?: boolean;
		allowLuId?: boolean;
		addLabel?: string;
		addText?: string;
		removeText?: string;
		onadd: (value: string) => Promise<void>;
		onremove?: (value: string) => Promise<void>;
	} & HTMLAttributes<EventTarget> = $props();
	let value = $state('');
	let query = $state('');
	let emailDraft = $state('');
	let busy = $state(false);
	const userOptions = $derived(
		suggestions.map((user) => ({
			id: user.user_id,
			// Combo resolves typed text back to an option by label. Include the
			// stable ID so equal display names do not collapse to the first user.
			label: `${user.name ?? user.user_id} · ${user.user_id}`,
			user
		}))
	);
	const comboOptions = $derived.by(() => {
		const search = query.trim();
		if (
			!allowLuId ||
			!search ||
			userOptions.some((option) =>
				option.label.toLocaleLowerCase().includes(search.toLocaleLowerCase())
			)
		)
			return userOptions;
		const userId = search.includes(':') ? search : `lund-university:${search}`;
		return [
			...userOptions,
			{
				id: userId,
				label: `${m.add_user_suggestion({ id: userId })} · ${userId}`,
				user: { user_id: userId },
				createUserId: userId
			}
		];
	});
	const trimmedValue = $derived(value.trim());
	const emailValue = $derived(/^\S+@\S+\.\S+$/.test(emailDraft.trim()) ? emailDraft.trim() : '');

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
			await onadd(trimmedValue);
			value = '';
			query = '';
		} finally {
			busy = false;
		}
	}

	async function inviteEmail(): Promise<void> {
		if (!emailValue) return;
		busy = true;
		try {
			await onadd(`email:${emailValue}`);
			emailDraft = '';
		} finally {
			busy = false;
		}
	}

	function captureQuery(event: Event): void {
		if (event.target instanceof HTMLInputElement) query = event.target.value;
	}
</script>

<div {...rest}>
	<h3 class="section-title">
		{title}
		{#if count !== undefined}<span class="pill">{count}</span>{/if}
	</h3>
	<div class="toolbar" oninput={captureQuery}>
		<label class="field" style="flex: 1">
			<span>{addLabel}</span>
			<UserCombo bind:value options={comboOptions} clear>
				{#snippet children({ option })}
					<div class="combo-user">
						<strong
							>{option.createUserId
								? m.add_user_suggestion({ id: option.createUserId })
								: (option.user.name ?? option.id)}</strong
						><code>{option.id}</code>
					</div>
				{/snippet}
			</UserCombo>
		</label><button
			class="button-link secondary"
			type="button"
			disabled={busy || !trimmedValue}
			onclick={() => void add()}>{addText}</button>
	</div>
	{#if allowEmailInvite}
		<div class="toolbar user-email-invite">
			<label class="field" style="flex: 1">
				<span>{m.invite_user()}</span>
				<input type="email" bind:value={emailDraft} placeholder="name@example.org" />
			</label>
			<button
				class="button-link secondary"
				type="button"
				disabled={busy || !emailValue}
				onclick={() => void inviteEmail()}>{m.invite_user()}</button>
		</div>
	{/if}
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
