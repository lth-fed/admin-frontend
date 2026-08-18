<script lang="ts">
	import { getLocale } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';

	let {
		label,
		value,
		optional = false,
		error = false,
		onchange
	}: {
		label: string;
		value: number | undefined;
		optional?: boolean;
		error?: boolean;
		onchange: (value: number | undefined) => void;
	} = $props();

	type ParsedMoney =
		{ valid: true; value: number | undefined } | { valid: false; value: undefined };

	function parseKronor(input: string): ParsedMoney {
		const normalized = input.trim().replaceAll(' ', '').replaceAll('\u00a0', '');
		if (!normalized) return { valid: true, value: undefined };
		if (!/^(?:\d+(?:[.,]\d{0,2})?|[.,]\d{1,2})$/.test(normalized)) {
			return { valid: false, value: undefined };
		}

		const [whole = '0', decimals = ''] = normalized.replace(',', '.').split('.');
		const valueInOre = Number(whole || '0') * 100 + Number(decimals.padEnd(2, '0'));
		return Number.isSafeInteger(valueInOre)
			? { valid: true, value: valueInOre }
			: { valid: false, value: undefined };
	}

	function formatKronor(valueInOre: number | undefined): string {
		if (!Number.isSafeInteger(valueInOre) || valueInOre === undefined || valueInOre < 0) return '';
		const separator = getLocale() === 'sv' ? ',' : '.';
		return `${Math.floor(valueInOre / 100)}${separator}${String(valueInOre % 100).padStart(2, '0')}`;
	}

	let focused = $state(false);
	let draft = $state('');
	const parsed = $derived(parseKronor(draft));
	const invalid = $derived(error || !parsed.valid || (!optional && parsed.value === undefined));

	$effect.pre(() => {
		if (!focused && (value === undefined || Number.isSafeInteger(value))) {
			draft = formatKronor(value);
		}
	});

	function input(element: HTMLInputElement): void {
		const next = element.value;
		const compact = next.trim().replaceAll(' ', '').replaceAll('\u00a0', '');
		if (/^\d*[.,]\d{3,}$/.test(compact)) {
			element.value = draft;
			return;
		}
		draft = next;
		const result = parseKronor(next);
		onchange(result.valid ? (result.value ?? (optional ? undefined : Number.NaN)) : Number.NaN);
	}

	function blur(): void {
		focused = false;
		const result = parseKronor(draft);
		if (result.valid && result.value !== undefined) draft = formatKronor(result.value);
		else if (result.valid && optional) draft = '';
	}
</script>

<label class="field money-field">
	<span>{label}</span>
	<div class:invalid class="money-input">
		<input
			type="text"
			inputmode="decimal"
			autocomplete="off"
			spellcheck="false"
			placeholder={m.money_input_placeholder()}
			required={!optional}
			aria-invalid={invalid}
			value={draft}
			onfocus={() => (focused = true)}
			oninput={(event) => input(event.currentTarget)}
			onblur={blur} />
		<span class="currency" aria-hidden="true">{m.currency_suffix()}</span>
	</div>
	{#if invalid}<small class="money-error">{m.money_input_invalid()}</small>{/if}
</label>

<style>
	.money-input {
		position: relative;
	}

	.money-input input {
		padding-right: 4rem;
		font-variant-numeric: tabular-nums;
	}

	.currency {
		position: absolute;
		top: 50%;
		right: 11px;
		padding-left: 10px;
		border-left: 1px solid #3a403c;
		color: #969d98;
		font-size: 0.82rem;
		font-weight: 700;
		line-height: 1.4;
		pointer-events: none;
		transform: translateY(-50%);
	}

	.money-input.invalid input {
		border-color: #bf6b6b;
	}

	.money-error {
		color: #e7a0a0;
	}
</style>
