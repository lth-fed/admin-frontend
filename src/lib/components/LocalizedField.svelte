<script lang="ts">
	import type { Localized } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { Switch } from '@svar-ui/svelte-core';
	import { untrack } from 'svelte';

	let {
		value,
		labelSv,
		labelEn,
		multiline = false,
		required = false,
		placeholderSv,
		placeholderEn,
		onchange
	}: {
		value: Localized;
		labelSv: string;
		labelEn: string;
		multiline?: boolean;
		required?: boolean;
		placeholderSv?: string;
		placeholderEn?: string;
		onchange: (value: Localized) => void;
	} = $props();

	let overrideEnglish = $state(untrack(() => (value.en ?? '') !== (value.sv ?? '')));

	function updateSwedish(sv: string): void {
		onchange({ ...value, sv, en: overrideEnglish ? (value.en ?? '') : sv });
	}

	function updateEnglish(en: string): void {
		onchange({ ...value, en });
	}

	function toggleOverride(enabled: boolean): void {
		overrideEnglish = enabled;
		if (!enabled) onchange({ ...value, en: value.sv ?? '' });
	}
</script>

<div class="localized-field-pair">
	<label class="field">
		<span>{labelSv}</span>
		{#if multiline}
			<textarea
				{required}
				placeholder={placeholderSv}
				value={value.sv ?? ''}
				oninput={(event) => updateSwedish(event.currentTarget.value)}></textarea>
		{:else}
			<input
				{required}
				placeholder={placeholderSv}
				value={value.sv ?? ''}
				oninput={(event) => updateSwedish(event.currentTarget.value)} />
		{/if}
	</label>
	<div class="localized-english-option">
		<label class="switch-field localized-override">
			<Switch value={overrideEnglish} onchange={({ value: enabled }) => toggleOverride(enabled)} />
			<span>{m.override_english()}</span>
		</label>
		{#if overrideEnglish}
			<label class="field localized-english">
				<span class="visually-hidden">{labelEn}</span>
				{#if multiline}
					<textarea
						{required}
						aria-label={labelEn}
						placeholder={placeholderEn}
						value={value.en ?? ''}
						oninput={(event) => updateEnglish(event.currentTarget.value)}></textarea>
				{:else}
					<input
						{required}
						aria-label={labelEn}
						placeholder={placeholderEn}
						value={value.en ?? ''}
						oninput={(event) => updateEnglish(event.currentTarget.value)} />
				{/if}
			</label>
		{/if}
	</div>
</div>
