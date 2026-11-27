<script lang="ts">
	import DateTimePicker from '$lib/components/DateTimePicker.svelte';
	import { addMonths, untilFor, type ExpiryPreset } from '$lib/expiry';
	import * as m from '$lib/paraglide/messages';
	import { onMount } from 'svelte';
	import { SvelteDate } from 'svelte/reactivity';

	let {
		activityEnd = null,
		allowNever = false,
		initial = null,
		label = m.sales_device_until(),
		onchange
	}: {
		/** Enables the "until the activity is over" preset. */
		activityEnd?: string | null;
		/** Adds a "no end" preset (memberships may last forever; devices may not). */
		allowNever?: boolean;
		/** Existing expiry to start from, edited as a custom date. */
		initial?: string | null;
		label?: string;
		onchange: (until: string | null) => void;
	} = $props();

	// Only the first values matter: the component owns the choice afterwards.
	// svelte-ignore state_referenced_locally
	let preset = $state<ExpiryPreset>(initial ? 'custom' : allowNever ? 'never' : 'end_of_year');
	// svelte-ignore state_referenced_locally
	let customUntil = $state(initial ?? addMonths(new SvelteDate(), 6).toISOString());
	let touched = false;
	// Default to the activity end once it is known (it loads after mount).
	$effect(() => {
		if (activityEnd && !touched && !initial) {
			preset = 'activity_end';
			emit();
		}
	});

	const options = $derived<{ id: ExpiryPreset; label: string }[]>([
		...(activityEnd
			? [{ id: 'activity_end' as const, label: m.sales_device_until_activity_end() }]
			: []),
		{ id: 'end_of_week', label: m.sales_device_until_end_of_week() },
		{ id: 'end_of_year', label: m.sales_device_until_end_of_year() },
		{ id: 'one_month', label: m.sales_device_until_one_month() },
		{ id: 'six_months', label: m.sales_device_until_six_months() },
		{ id: 'custom', label: m.sales_device_until_custom() },
		...(allowNever ? [{ id: 'never' as const, label: m.expiry_never() }] : [])
	]);

	function emit(): void {
		onchange(untilFor(preset, { customUntil, activityEnd }));
	}

	// Publish the initial choice so the parent never has to guess a default.
	onMount(() => emit());

	function choose(value: ExpiryPreset): void {
		preset = value;
		touched = true;
		emit();
	}
</script>

<label class="field"
	><span>{label}</span>
	<select value={preset} onchange={(event) => choose(event.currentTarget.value as ExpiryPreset)}>
		{#each options as option (option.id)}
			<option value={option.id}>{option.label}</option>
		{/each}
	</select></label>
{#if preset === 'custom'}
	<DateTimePicker
		label={m.sales_device_until_custom()}
		value={customUntil}
		onchange={(value) => {
			customUntil = value;
			emit();
		}} />
{/if}
