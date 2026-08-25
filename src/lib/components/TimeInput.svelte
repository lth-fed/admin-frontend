<script lang="ts">
	let {
		value,
		error = false,
		disabled = false,
		onchange
	}: {
		value: Date;
		error?: boolean;
		disabled?: boolean;
		onchange: (hours: number, minutes: number) => void;
	} = $props();

	let editing = $state(false);
	let text = $state('');

	$effect(() => {
		if (!editing) text = formatTime(value);
	});

	function formatTime(date: Date): string {
		if (Number.isNaN(date.getTime())) return '';
		return `${date.getHours().toString().padStart(2, '0')}:${date
			.getMinutes()
			.toString()
			.padStart(2, '0')}`;
	}

	function digits(value: string): string {
		return value.replace(/\D/g, '').slice(0, 4);
	}

	function displayDigits(value: string): string {
		return value.length > 2 ? `${value.slice(0, 2)}:${value.slice(2)}` : value;
	}

	function commit(): void {
		const raw = digits(text);
		if (raw.length === 0) {
			text = formatTime(value);
			return;
		}

		const hours = Number(raw.length <= 2 ? raw : raw.slice(0, 2));
		const minutes = Number(raw.length <= 2 ? 0 : raw.slice(2));
		const clampedHours = Math.min(hours, 23);
		const clampedMinutes = hours > 23 ? 59 : Math.min(minutes, 59);
		text = `${clampedHours.toString().padStart(2, '0')}:${clampedMinutes
			.toString()
			.padStart(2, '0')}`;
		onchange(clampedHours, clampedMinutes);
	}

	function handleInput(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		const raw = digits(input.value);
		text = displayDigits(raw);
		if (raw.length === 4) commit();
	}

	function selectAll(event: MouseEvent | FocusEvent): void {
		(event.currentTarget as HTMLInputElement).select();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		commit();
		(event.currentTarget as HTMLInputElement).select();
	}
</script>

<input
	type="text"
	inputmode="numeric"
	pattern="[0-9:]*"
	maxlength="5"
	autocomplete="off"
	aria-label="Time"
	aria-invalid={error}
	{disabled}
	bind:value={text}
	onfocus={(event) => {
		editing = true;
		selectAll(event);
	}}
	onclick={selectAll}
	oninput={handleInput}
	onkeydown={handleKeydown}
	onblur={() => {
		commit();
		editing = false;
	}} />
