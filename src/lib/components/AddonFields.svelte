<script lang="ts">
	import type { PutTicketKind } from '$lib/api/types';
	import { validBookkeeping } from '$lib/addon-validation';
	import BookkeepingCategorySelect from './BookkeepingCategorySelect.svelte';
	import LocalizedField from './LocalizedField.svelte';
	import MoneyInput from './MoneyInput.svelte';
	import { kronor, localize } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { ChevronRight, Plus, Trash2 } from '@lucide/svelte';
	import { Switch } from '@svar-ui/svelte-core';

	type Addon = PutTicketKind['addons'][number];
	type Option = Addon['options'][number];
	let {
		addon,
		disabled = false,
		locked = false,
		showErrors = false,
		onchange
	}: {
		addon: Addon;
		disabled?: boolean;
		locked?: boolean;
		showErrors?: boolean;
		onchange: (addon: Addon) => void;
	} = $props();
	let expandedOptionIds = $state<string[]>([]);

	function update(value: Partial<Addon>): void {
		if (!disabled && !locked) onchange({ ...addon, ...value });
	}

	function updateOption(index: number, value: Partial<Option>): void {
		update({
			options: addon.options.map((option, i) => (i === index ? { ...option, ...value } : option))
		});
	}

	function updateBookkeeping(index: number, categories: string[], prices: number[]): void {
		if (disabled) return;
		// Accounting allocations remain editable after a linked ticket has been purchased.
		onchange({
			...addon,
			options: addon.options.map((option, i) =>
				i === index
					? { ...option, bookkeeping_price_categories: categories, bookkeeping_prices: prices }
					: option
			)
		});
	}

	function addOption(): void {
		update({
			options: [
				...addon.options,
				{
					id: crypto.randomUUID(),
					idx: addon.options.length,
					name: { sv: '', en: '' },
					price: 0,
					bookkeeping_prices: [0],
					bookkeeping_price_categories: ['null']
				}
			]
		});
	}

	function removeOption(index: number): void {
		update({
			options: addon.options
				.filter((_, i) => i !== index)
				.map((option, idx) => ({ ...option, idx }))
		});
	}
</script>

{#if locked}<p class="warning-banner">{m.shared_addon_locked()}</p>{/if}

<section class="card card-pad stack">
	<h2 class="section-title">{m.creation_step_details()}</h2>
	<fieldset class="stack" disabled={disabled || locked} inert={disabled || locked}>
		<LocalizedField
			value={addon.name}
			labelSv={m.addon_name_sv()}
			labelEn={m.addon_name_en()}
			errorSv={showErrors && !addon.name.sv?.trim()}
			errorEn={showErrors && !addon.name.en?.trim()}
			required
			onchange={(name) => update({ name })} />
		<div class="addon-switches">
			<label class="switch-field"
				><Switch
					value={addon.required}
					onchange={({ value }) => update({ required: value })} /><span>{m.addon_required()}</span
				></label>
			<label class="switch-field"
				><Switch
					value={addon.multiple_alternatives}
					onchange={({ value }) => update({ multiple_alternatives: value })} /><span
					>{m.addon_multiple_options()}</span
				></label>
			<label class="switch-field"
				><Switch
					value={addon.has_text_field}
					onchange={({ value }) => update({ has_text_field: value })} /><span
					>{m.addon_text_field()}</span
				></label>
		</div>
	</fieldset>
</section>

<section class="card card-pad stack gap-2!">
	<div class="section-heading">
		<h2 class="section-title">
			{m.addon_options()} <span class="pill">{addon.options.length}</span>
		</h2>
		<button
			type="button"
			class="button-link secondary"
			disabled={disabled || locked}
			onclick={addOption}><Plus size={17} />{m.add_option()}</button>
	</div>
	{#each addon.options as option, index (option.id)}
		{@const open = expandedOptionIds.includes(option.id) ||
			(showErrors &&
				(!option.name.sv?.trim() ||
					!option.name.en?.trim() ||
					!Number.isSafeInteger(option.price) ||
					option.price < 0 ||
					!validBookkeeping(option)))}
		<details
			class={["option-panel", { "option-card": open, }]}
			ontoggle={(event) => {
				const expanded = event.currentTarget.open;
				if (expanded === expandedOptionIds.includes(option.id)) return;
				expandedOptionIds = expanded
					? [...expandedOptionIds, option.id]
					: expandedOptionIds.filter((id) => id !== option.id);
			}}
			open={open}>
			<summary class={["cursor-pointer", {"p-0!": !open}]}>
				<span class="collapse-summary-name"
					><ChevronRight class="collapse-arrow" size={17} />{localize(option.name, '').trim() ||
						m.empty_option()}</span>
				<span>{kronor(option.price)}</span>
			</summary>
			<div class="stack option-content">
				<div class="toolbar addon-actions">
					<button
						type="button"
						class="button-link secondary danger-button"
						disabled={disabled || locked}
						onclick={() => removeOption(index)}><Trash2 size={16} />{m.remove()}</button>
				</div>
				<fieldset class="stack" disabled={disabled || locked} inert={disabled || locked}>
					<LocalizedField
						value={option.name}
						labelSv={m.option_name_sv()}
						labelEn={m.option_name_en()}
						errorSv={showErrors && !option.name.sv?.trim()}
						errorEn={showErrors && !option.name.en?.trim()}
						required
						onchange={(name) => updateOption(index, { name })} />
					<MoneyInput
						label={m.option_price()}
						value={option.price}
						error={showErrors && (!Number.isSafeInteger(option.price) || option.price < 0)}
						onchange={(price) => updateOption(index, { price: price ?? Number.NaN })} />
				</fieldset>
				<fieldset
					class="stack"
					{disabled}
					inert={disabled}
					class:field-error={showErrors && !validBookkeeping(option)}>
					<div class="toolbar between">
						<div>
							<h4 class="section-title">{m.bookkeeping()}</h4>
							<p class="muted">{m.bookkeeping_report_help()}</p>
							<p class="muted">
								{m.bookkeeping_total({
									total: kronor(option.bookkeeping_prices.reduce((sum, price) => sum + price, 0)),
									price: kronor(option.price)
								})}
							</p>
						</div>
						<button
							type="button"
							class="button-link secondary"
							{disabled}
							onclick={() =>
								updateBookkeeping(
									index,
									[...option.bookkeeping_price_categories, 'null'],
									[...option.bookkeeping_prices, 0]
								)}><Plus size={16} />{m.add_bookkeeping_category()}</button>
					</div>
					{#if showErrors && !validBookkeeping(option)}<p class="error-banner" role="alert">
							{m.addon_bookkeeping_invalid()}
						</p>{/if}
					{#each option.bookkeeping_price_categories as category, categoryIndex (`${option.id}-${categoryIndex}`)}
						<div class="bookkeeping-row">
							<BookkeepingCategorySelect
								value={category}
								onchange={(value) =>
									updateBookkeeping(
										index,
										option.bookkeeping_price_categories.map((item, i) =>
											i === categoryIndex ? value : item
										),
										option.bookkeeping_prices
									)} />
							<MoneyInput
								label={m.bookkeeping_amount()}
								value={option.bookkeeping_prices[categoryIndex]}
								error={showErrors &&
									(!Number.isSafeInteger(option.bookkeeping_prices[categoryIndex]) ||
										option.bookkeeping_prices[categoryIndex] < 0)}
								onchange={(price) =>
									updateBookkeeping(
										index,
										option.bookkeeping_price_categories,
										option.bookkeeping_prices.map((item, i) =>
											i === categoryIndex ? (price ?? Number.NaN) : item
										)
									)} />
							<button
								type="button"
								class="icon-button danger-button"
								aria-label={m.remove()}
								{disabled}
								onclick={() =>
									updateBookkeeping(
										index,
										option.bookkeeping_price_categories.filter((_, i) => i !== categoryIndex),
										option.bookkeeping_prices.filter((_, i) => i !== categoryIndex)
									)}><Trash2 size={16} /></button>
						</div>
					{/each}
				</fieldset>
			</div>
		</details>
	{:else}
		<p class="empty-state">{m.empty()}</p>
	{/each}
</section>
