<script lang="ts">
	import { onMount } from 'svelte';
	import { getPersonalAccount, savePersonalAccount, unlinkPersonalAccount } from '$lib/api/admin';
	import { frontendError } from '$lib/api/client';
	import * as m from '$lib/paraglide/messages';

	let account = $state('');
	let loading = $state(true);
	let saving = $state(false);

	onMount(() => {
		void (async () => {
			try {
				account = (await getPersonalAccount()) ?? '';
			} catch (cause) {
				frontendError(cause);
			} finally {
				loading = false;
			}
		})();
	});

	function normalizeAccount(): void {
		account = account.trim();
		if (account && !account.includes(':')) account = `lund-university:${account}`;
	}

	async function save(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (loading || saving) return;
		normalizeAccount();
		saving = true;
		try {
			if (account) await savePersonalAccount(account);
			else await unlinkPersonalAccount();
		} catch (cause) {
			frontendError(cause);
		} finally {
			saving = false;
		}
	}
</script>

<form onsubmit={save} class="personal-account-setting">
	<label class="field">
		<span>{m.personal_account()}</span>
		<input
			bind:value={account}
			onblur={normalizeAccount}
			placeholder="lund-university:ab1234cd-s"
			disabled={loading || saving}
			autocapitalize="none"
			spellcheck="false"
			aria-describedby="personal-account-help" />
		<small id="personal-account-help">{m.personal_account_help()}</small>
	</label>
	<button class="button-link" type="submit" disabled={loading || saving}>
		{saving ? m.saving() : account.trim() ? m.save() : m.unlink_account()}
	</button>
</form>

<style>
	.personal-account-setting {
		display: grid;
		gap: 0.5rem;
		min-width: 0;
	}
	input {
		min-width: 0;
		width: 100%;
	}
</style>
