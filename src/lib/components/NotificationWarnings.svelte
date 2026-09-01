<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { onMount } from 'svelte';

	let {
		sendAt,
		groupPath,
		activityRecipient,
		dangerousActivityVisibility = false
	}: {
		sendAt: string;
		groupPath?: string;
		activityRecipient?: 'all' | 'buyers' | 'ticket_holders';
		dangerousActivityVisibility?: boolean;
	} = $props();
	let now = $state(Date.now());

	onMount(() => {
		const interval = window.setInterval(() => (now = Date.now()), 1_000);
		return () => window.clearInterval(interval);
	});

	const sendsImmediately = $derived(
		sendAt !== '' && !Number.isNaN(Date.parse(sendAt)) && Date.parse(sendAt) <= now
	);
	const targetsHighLevelGroup = $derived(
		groupPath !== undefined && groupPath.split('.').length <= 2
	);
</script>

{#if sendsImmediately}
	<p class="warning-banner" role="note">{m.notification_sends_immediately_warning()}</p>
{/if}
{#if targetsHighLevelGroup}
	<p class="warning-banner" role="note">{m.high_level_group_notification_warning()}</p>
{/if}
{#if activityRecipient === 'all' && dangerousActivityVisibility}
	<p class="warning-banner" role="note">{m.visible_activity_notification_warning()}</p>
{/if}
