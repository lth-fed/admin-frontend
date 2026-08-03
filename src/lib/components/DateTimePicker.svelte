<script lang="ts">
	import { DatePicker, TimePicker } from '@svar-ui/svelte-core';
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

	const date = $derived(new Date(value));

	function changeDate(next: Date | null): void {
		if (!next) return;
		const merged = new SvelteDate(date);
		merged.setFullYear(next.getFullYear(), next.getMonth(), next.getDate());
		onchange(merged.toISOString());
	}

	function changeTime(next: Date): void {
		const merged = new SvelteDate(date);
		merged.setHours(next.getHours(), next.getMinutes(), 0, 0);
		onchange(merged.toISOString());
	}
</script>

<div class="field">
	<span>{label}</span>
	<div class="date-time-pickers">
		<DatePicker
			value={date}
			{error}
			buttons={['today']}
			editable
			onchange={({ value: next }) => changeDate(next)} />
		<TimePicker value={date} {error} onchange={({ value: next }) => changeTime(next)} />
	</div>
</div>
