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
		errorSv = false,
		errorEn = false,
		placeholderSv,
		placeholderEn,
		prefix,
		prefixLabel,
		suggestions = [],
		onchange
	}: {
		value: Localized;
		labelSv: string;
		labelEn: string;
		multiline?: boolean;
		required?: boolean;
		errorSv?: boolean;
		errorEn?: boolean;
		placeholderSv?: string;
		placeholderEn?: string;
		prefix?: string;
		prefixLabel?: string;
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
	<label class:field-error={errorSv} class="field">
		<span>{labelSv}</span>
		{#if multiline}
			<textarea
				{required}
				aria-invalid={errorSv}
				placeholder={placeholderSv}
				value={value.sv ?? ''}
				oninput={(event) => updateSwedish(event.currentTarget.value)}></textarea>
		{:else}
			<div class:invalid={errorSv} class:with-prefix={prefix} class="localized-input">
				{#if prefix}
					<span class="input-prefix" title={prefix}>
						{#if prefixLabel}<span class="visually-hidden">{prefixLabel}: </span>{/if}{prefix}
					</span>
				{/if}
				<input
					{required}
					aria-invalid={errorSv}
					list={suggestions.length ? swedishSuggestions : undefined}
					placeholder={placeholderSv}
					value={value.sv ?? ''}
					oninput={(event) => updateSwedish(event.currentTarget.value)} />
			</div>
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
			<label class:field-error={errorEn} class="field localized-english">
				<span class="visually-hidden">{labelEn}</span>
				{#if multiline}
					<textarea
						{required}
						aria-invalid={errorEn}
						aria-label={labelEn}
						placeholder={placeholderEn}
						value={value.en ?? ''}
						oninput={(event) => updateEnglish(event.currentTarget.value)}></textarea>
				{:else}
					<div class:invalid={errorEn} class:with-prefix={prefix} class="localized-input">
						{#if prefix}
							<span class="input-prefix" title={prefix}>
								{#if prefixLabel}<span class="visually-hidden">{prefixLabel}: </span>{/if}{prefix}
							</span>
						{/if}
						<input
							{required}
							aria-invalid={errorEn}
							list={suggestions.length ? englishSuggestions : undefined}
							aria-label={labelEn}
							placeholder={placeholderEn}
							value={value.en ?? ''}
							oninput={(event) => updateEnglish(event.currentTarget.value)} />
					</div>
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

<style>
	.localized-input.with-prefix {
		display: flex;
		align-items: stretch;
		width: 100%;
		border: 1px solid #3a403c;
		border-radius: 4px;
		background: #141715;
	}

	.localized-input.with-prefix:focus-within {
		outline: 3px solid rgb(143 153 147 / 0.18);
		border-color: #7f8983;
	}

	.localized-input.with-prefix.invalid {
		border-color: #bf6b6b;
	}

	.localized-input.with-prefix.invalid:focus-within {
		outline-color: rgb(191 107 107 / 0.24);
	}

	.localized-input.with-prefix input {
		min-width: 0;
		width: auto;
		flex: 1;
		border: 0 !important;
		background: transparent;
	}

	.localized-input.with-prefix input:focus {
		outline: none;
	}

	.input-prefix {
		align-self: center;
		max-width: 50%;
		margin-block: 4px;
		padding-inline: 10px;
		overflow: hidden;
		border-right: 1px solid #3a403c;
		color: #969d98;
		font-size: 0.82rem;
		font-weight: 700;
		line-height: 1.4;
		text-overflow: ellipsis;
		white-space: nowrap;
		pointer-events: none;
	}
</style>
