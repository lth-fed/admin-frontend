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
		suggestions = [],
		onchange
	}: {
		value: Localized;
		labelSv: string;
		labelEn: string;
		multiline?: boolean;
		required?: boolean;
		placeholderSv?: string;
		placeholderEn?: string;
		suggestions?: Localized[];
		onchange: (value: Localized) => void;
	} = $props();

	let overrideEnglish = $state(
		untrack(() => {
			const swedish = value.sv ?? '';
			const english = value.en ?? '';
			return (swedish === '' && english === '') || swedish !== english;
		})
	);
	const swedishSuggestions = `localized-sv-${crypto.randomUUID()}`;
	const englishSuggestions = `localized-en-${crypto.randomUUID()}`;

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
				list={suggestions.length ? swedishSuggestions : undefined}
				placeholder={placeholderSv}
				value={value.sv ?? ''}
				oninput={(event) => updateSwedish(event.currentTarget.value)} />
		{/if}
		{#if suggestions.length}<datalist id={swedishSuggestions}>
				{#each suggestions as suggestion, index (index)}<option
						value={suggestion.sv ?? suggestion.en ?? ''}></option
					>{/each}
			</datalist>{/if}
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
						list={suggestions.length ? englishSuggestions : undefined}
						aria-label={labelEn}
						placeholder={placeholderEn}
						value={value.en ?? ''}
						oninput={(event) => updateEnglish(event.currentTarget.value)} />
				{/if}
				{#if suggestions.length}<datalist id={englishSuggestions}>
						{#each suggestions as suggestion, index (index)}<option
								value={suggestion.en ?? suggestion.sv ?? ''}></option
							>{/each}
					</datalist>{/if}
			</label>
		{/if}
	</div>
</div>
