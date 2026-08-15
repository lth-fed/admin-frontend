<script lang="ts">
	import type { Group, PutTicketKind } from '$lib/api/types';
	import DateTimePicker from '$lib/components/DateTimePicker.svelte';
	import GroupTreePicker from '$lib/components/GroupTreePicker.svelte';
	import LocalizedField from '$lib/components/LocalizedField.svelte';
	import MoneyInput from '$lib/components/MoneyInput.svelte';
	import * as m from '$lib/paraglide/messages';

	let {
		value,
		groups,
		showName = true,
		showPrice = true,
		showDates = true,
		capacityLabel,
		capacityMin = 1,
		singleGroup = false,
		onchange
	}: {
		value: PutTicketKind;
		groups: Group[];
		showName?: boolean;
		showPrice?: boolean;
		showDates?: boolean;
		capacityLabel?: string;
		capacityMin?: number;
		singleGroup?: boolean;
		onchange: (value: PutTicketKind) => void;
	} = $props();

	function update(update: Partial<PutTicketKind>): void {
		onchange({ ...value, ...update });
	}
</script>

<div class="grid-2">
	{#if showName}
		<LocalizedField
			value={value.name}
			labelSv={m.name_sv()}
			labelEn={m.name_en()}
			required
			onchange={(name) => update({ name })} />
	{/if}
	{#if showPrice}
		<MoneyInput
			label={m.price()}
			value={value.price}
			onchange={(price) => update({ price: price ?? Number.NaN })} />
	{/if}
	{#if capacityLabel}
		<label class="field">
			<span>{capacityLabel}</span>
			<input
				type="number"
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
				onchange={(purchasing_available_start) => update({ purchasing_available_start })} />
			<DateTimePicker
				label={m.available_until()}
				value={value.purchasing_available_stop}
				error={new Date(value.purchasing_available_stop) <=
					new Date(value.purchasing_available_start)}
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
