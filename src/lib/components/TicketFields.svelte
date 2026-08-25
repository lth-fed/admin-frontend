<script lang="ts">
	import type { Group, PutTicketKind } from '$lib/api/types';
	import { ticketReleaseIsTooSoon } from '$lib/activity-form';
	import DateTimePicker from '$lib/components/DateTimePicker.svelte';
	import GroupTreePicker from '$lib/components/GroupTreePicker.svelte';
	import LocalizedField from '$lib/components/LocalizedField.svelte';
	import MoneyInput from '$lib/components/MoneyInput.svelte';
	import * as m from '$lib/paraglide/messages';
	import { Switch } from '@svar-ui/svelte-core';
	import { onMount } from 'svelte';

	let {
		value,
		groups,
		showName = true,
		showPrice = true,
		showDates = true,
		showInvitedToggle = false,
		invited = false,
		capacityLabel,
		capacityMin = 1,
		singleGroup = false,
		releaseStartLocked = false,
		invalidField = null,
		oninvitedchange,
		onchange
	}: {
		value: PutTicketKind;
		groups: Group[];
		showName?: boolean;
		showPrice?: boolean;
		showDates?: boolean;
		showInvitedToggle?: boolean;
		invited?: boolean;
		capacityLabel?: string;
		capacityMin?: number;
		singleGroup?: boolean;
		releaseStartLocked?: boolean;
		invalidField?: string | null;
		oninvitedchange?: (invited: boolean) => void;
		onchange: (value: PutTicketKind) => void;
	} = $props();

	function update(update: Partial<PutTicketKind>): void {
		onchange({ ...value, ...update });
	}

	let now = $state(Date.now());
	const releaseTooSoon = $derived(ticketReleaseIsTooSoon(value.purchasing_available_start, now));

	onMount(() => {
		const timer = window.setInterval(() => (now = Date.now()), 30_000);
		return () => window.clearInterval(timer);
	});
</script>

<div class="grid-2">
	{#if showName}
		<LocalizedField
			value={value.name}
			labelSv={m.name_sv()}
			labelEn={m.name_en()}
			required
			errorSv={invalidField === m.name_sv() || invalidField === m.ticket_name()}
			errorEn={invalidField === m.name_en() || invalidField === m.ticket_name()}
			onchange={(name) => update({ name })} />
	{/if}
	{#if showInvitedToggle && oninvitedchange}
		<label class="switch-field">
			<Switch value={invited} onchange={({ value }) => oninvitedchange(value)} />
			<span>{m.invited_ticket()}</span>
		</label>
	{/if}
	{#if showPrice}
		<MoneyInput
			label={m.price()}
			value={value.price}
			error={invalidField === m.price()}
			onchange={(price) => update({ price: price ?? Number.NaN })} />
	{/if}
	{#if capacityLabel}
		<label class:field-error={invalidField === capacityLabel} class="field">
			<span>{capacityLabel}</span>
			<input
				type="number"
				aria-invalid={invalidField === capacityLabel}
				min={capacityMin}
				max={2_147_483_646}
				value={value.max_tickets}
				oninput={(event) => update({ max_tickets: event.currentTarget.valueAsNumber })} />
		</label>
	{/if}
	{#if showDates}
		<div class="date-range">
			<DateTimePicker
				label={m.available_from()}
				value={value.purchasing_available_start}
				error={invalidField === m.available_from() || (!releaseStartLocked && releaseTooSoon)}
				disabled={releaseStartLocked}
				onchange={(purchasing_available_start) => update({ purchasing_available_start })} />
			<DateTimePicker
				label={m.available_until()}
				value={value.purchasing_available_stop}
				error={invalidField === m.available_until() ||
					new Date(value.purchasing_available_stop) <= new Date(value.purchasing_available_start)}
				onchange={(purchasing_available_stop) => update({ purchasing_available_stop })} />
		</div>
	{/if}
</div>

<GroupTreePicker
	title={m.allowed_groups()}
	{groups}
	selectedIds={value.allowed_group_ids}
	inheritDescendants={!singleGroup}
	onchange={(ids) => update({ allowed_group_ids: singleGroup ? ids.slice(-1) : ids })} />
