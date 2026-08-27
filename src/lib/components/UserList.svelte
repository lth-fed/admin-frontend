<script lang="ts">
	import type { AdminUser } from '$lib/api/types';
	import * as m from '$lib/paraglide/messages';
	import { Combo } from '@svar-ui/svelte-core';
	import type { Component, Snippet } from 'svelte';

	type UserOption = { id: string; label: string; user: AdminUser };
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
		allowCustomId = false,
		addLabel = m.user_id(),
		addText = m.add(),
		removeText = m.remove(),
		onadd,
		onremove
	}: {
		title: string;
		count?: number;
		items: Array<string | AdminUser>;
		suggestions?: AdminUser[];
		allowEmailInvite?: boolean;
		allowCustomId?: boolean;
		addLabel?: string;
		addText?: string;
		removeText?: string;
		onadd: (value: string) => Promise<void>;
		onremove?: (value: string) => Promise<void>;
	} = $props();
	let value = $state('');
	let emailDraft = $state('');
	let customIdDraft = $state('');
	let busy = $state(false);
	const comboOptions = $derived(
		suggestions.map((user) => ({
			id: user.user_id,
			// Combo resolves typed text back to an option by label. Include the
			// stable ID so equal display names do not collapse to the first user.
			label: `${user.name ?? user.user_id} · ${user.user_id}`,
			user
		}))
	);
	const trimmedValue = $derived(value.trim());
	const emailValue = $derived(/^\S+@\S+\.\S+$/.test(emailDraft.trim()) ? emailDraft.trim() : '');
	const customIdValue = $derived(customIdDraft.trim());

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

	async function addCustomId(): Promise<void> {
		if (!customIdValue) return;
		busy = true;
		try {
			await onadd(customIdValue);
			customIdDraft = '';
		} finally {
			busy = false;
		}
	}
</script>

<div>
	<h3 class="section-title">
		{title}
		{#if count !== undefined}<span class="pill">{count}</span>{/if}
	</h3>
	<div class="toolbar">
		<label class="field" style="flex: 1">
			<span>{addLabel}</span>
			<UserCombo bind:value options={comboOptions} clear>
				{#snippet children({ option })}
					<div class="combo-user">
						<strong>{option.user.name ?? option.id}</strong><code>{option.id}</code>
					</div>
				{/snippet}
			</UserCombo>
		</label><button
			class="button-link secondary"
			type="button"
			disabled={busy || !trimmedValue}
			onclick={() => void add()}>{addText}</button>
	</div>
	{#if allowCustomId}
		<div class="toolbar user-email-invite">
			<label class="field" style="flex: 1">
				<span>{m.add_member_by_id()}</span>
				<input bind:value={customIdDraft} autocomplete="off" />
			</label>
			<button
				class="button-link secondary"
				type="button"
				disabled={busy || !customIdValue}
				onclick={() => void addCustomId()}>{m.add()}</button>
		</div>
	{/if}
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
