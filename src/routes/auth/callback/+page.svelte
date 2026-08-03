<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { Pathname } from '$app/types';
	import { auth } from '$lib/auth.svelte';
	import * as m from '$lib/paraglide/messages';
	import { Button, WillowDark } from '@svar-ui/svelte-core';

	let error = $state<string | null>(null);

	$effect(() => {
		void (async () => {
			try {
				const returnTo = await auth.completeLogin();
				await goto(resolve(returnTo as Pathname), { replaceState: true });
			} catch (cause) {
				error = cause instanceof Error ? cause.message : String(cause);
			}
		})();
	});
</script>

<svelte:head><title>{m.auth_callback()} · {m.app_name()}</title></svelte:head>

<WillowDark>
	<main class="center-stage" aria-live="polite">
		{#if error}
			<h1>{m.auth_failed()}</h1>
			<p class="error-banner">{error}</p>
			<Button type="primary" text={m.try_again()} onclick={() => void auth.login('/')} />
		{:else}
			<div class="loader"></div>
			<p>{m.auth_callback()}</p>
		{/if}
	</main>
</WillowDark>
