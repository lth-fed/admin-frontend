<script lang="ts">
	import { createCalendarWords } from '$lib/i18n';
	import { getLocale } from '$lib/paraglide/runtime';
	import TimeInput from '$lib/components/TimeInput.svelte';
	import { DatePicker, Locale } from '@svar-ui/svelte-core';
	import { SvelteDate } from 'svelte/reactivity';

	let {
		label,
		value,
		error = false,
		onchange
	}: {
		label: string;
		value: string;
		error?: boolean;
		onchange: (value: string) => void;
	} = $props();

	const calendarLanguage = getLocale() === 'sv' ? 'sv-SE' : 'en-GB';
	const calendarWords = createCalendarWords(calendarLanguage);

	const date = $derived(new Date(value));

	function changeDate(next: Date | null): void {
		if (!next) return;
		const merged = new SvelteDate(date);
		merged.setFullYear(next.getFullYear(), next.getMonth(), next.getDate());
		onchange(merged.toISOString());
	}

	function parseDateInput(input: string): Date {
		const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input.trim());
		if (!match) return new Date(Number.NaN);
		const day = Number(match[1]);
		const month = Number(match[2]);
		const year = Number(match[3]);
		const parsed = new Date(year, month - 1, day);
		if (
			parsed.getFullYear() !== year ||
			parsed.getMonth() !== month - 1 ||
			parsed.getDate() !== day
		)
			return new Date(Number.NaN);
		return parsed;
	}

	function changeTime(hours: number, minutes: number): void {
		const merged = new SvelteDate(date);
		merged.setHours(hours, minutes, 0, 0);
		onchange(merged.toISOString());
	}
</script>

<div class="field">
	<span>{label}</span>
	<div class="date-time-pickers">
		<Locale words={calendarWords}>
			<DatePicker
				value={date}
				{error}
				buttons={['today']}
				format="%d/%m/%Y"
				editable={parseDateInput}
				onchange={({ value: next }) => changeDate(next)} />
		</Locale>
		<TimeInput value={date} {error} onchange={changeTime} />
	</div>
</div>
