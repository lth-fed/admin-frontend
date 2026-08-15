<script lang="ts">
	import type { PutTicketKind } from '$lib/api/types'
	import BookkeepingCategorySelect from '$lib/components/BookkeepingCategorySelect.svelte'
	import LocalizedField from '$lib/components/LocalizedField.svelte'
	import MoneyInput from '$lib/components/MoneyInput.svelte'
	import { kronor, localize } from '$lib/i18n'
	import * as m from '$lib/paraglide/messages'
	import { ChevronRight, Copy, Plus, Trash2 } from '@lucide/svelte'
	import { Switch } from '@svar-ui/svelte-core'

	type Addon = PutTicketKind['addons'][number]
	type Option = Addon['options'][number]

	let {
		addons,
		suggestions = [],
		disabled = false,
		onchange
	}: {
		addons: PutTicketKind['addons']
		suggestions?: PutTicketKind['name'][]
		disabled?: boolean
		onchange: (addons: PutTicketKind['addons']) => void
	} = $props()

	// it's fucked by the re-rendering of the item when it's name changes
	let open = $state([true])
	let openOptions: boolean[][] = $state([])

	function replace(next: PutTicketKind['addons']): void {
		onchange(next)
	}

	function displayName(name: PutTicketKind['name'], fallback: string): string {
		return localize(name, '').trim() || fallback
	}

	function updateAddon(index: number, update: Partial<Addon>): void {
		replace(
			addons.map((addon, itemIndex) =>
				itemIndex === index ? { ...addon, ...update } : addon
			)
		)
	}

	function addAddon(): void {
		replace([
			...addons,
			{
				id: crypto.randomUUID(),
				name: { sv: '', en: '' },
				multiple_alternatives: false,
				has_text_field: false,
				required: false,
				options: []
			}
		])
	}

	function duplicateAddon(index: number): void {
		const source = addons[index]
		const copy: Addon = {
			...source,
			id: crypto.randomUUID(),
			name: { sv: `${source.name.sv} (kopia)`, en: `${source.name.en} (copy)` },
			options: source.options.map((option) => ({
				...option,
				id: crypto.randomUUID(),
				name: { ...option.name },
				bookkeeping_prices: [...option.bookkeeping_prices],
				bookkeeping_price_categories: [...option.bookkeeping_price_categories]
			}))
		}
		replace([...addons.slice(0, index + 1), copy, ...addons.slice(index + 1)])
	}

	function removeAddon(index: number): void {
		replace(addons.filter((_, itemIndex) => itemIndex !== index))
	}

	function updateOption(addonIndex: number, optionIndex: number, update: Partial<Option>): void {
		const addon = addons[addonIndex]
		updateAddon(addonIndex, {
			options: addon.options.map((option, index) =>
				index === optionIndex ? { ...option, ...update } : option
			)
		})
	}

	function addOption(addonIndex: number): void {
		const addon = addons[addonIndex]
		updateAddon(addonIndex, {
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
		})
	}

	function removeOption(addonIndex: number, optionIndex: number): void {
		updateAddon(addonIndex, {
			options: addons[addonIndex].options
				.filter((_, index) => index !== optionIndex)
				.map((option, idx) => ({ ...option, idx }))
		})
	}

	function addCategory(addonIndex: number, optionIndex: number): void {
		const option = addons[addonIndex].options[optionIndex]
		updateOption(addonIndex, optionIndex, {
			bookkeeping_price_categories: [...option.bookkeeping_price_categories, 'null'],
			bookkeeping_prices: [...option.bookkeeping_prices, 0]
		})
	}

	function updateCategory(
		addonIndex: number,
		optionIndex: number,
		categoryIndex: number,
		category: string
	): void {
		const option = addons[addonIndex].options[optionIndex]
		updateOption(addonIndex, optionIndex, {
			bookkeeping_price_categories: option.bookkeeping_price_categories.map((value, index) =>
				index === categoryIndex ? category : value
			)
		})
	}

	function updateCategoryPrice(
		addonIndex: number,
		optionIndex: number,
		categoryIndex: number,
		price: number
	): void {
		const option = addons[addonIndex].options[optionIndex]
		updateOption(addonIndex, optionIndex, {
			bookkeeping_prices: option.bookkeeping_prices.map((value, index) =>
				index === categoryIndex ? price : value
			)
		})
	}

	function removeCategory(addonIndex: number, optionIndex: number, categoryIndex: number): void {
		const option = addons[addonIndex].options[optionIndex]
		updateOption(addonIndex, optionIndex, {
			bookkeeping_price_categories: option.bookkeeping_price_categories.filter(
				(_, index) => index !== categoryIndex
			),
			bookkeeping_prices: option.bookkeeping_prices.filter(
				(_, index) => index !== categoryIndex
			)
		})
	}
</script>

<section class="card card-pad stack">
	<div class="toolbar between">
		<h2 class="section-title">{m.addons()} <span class="pill">{addons.length}</span></h2>
		<button class="button-link secondary" type="button" {disabled} onclick={addAddon}>
			<Plus size={17} />
			{m.add_addon()}
		</button>
	</div>
	{#if addons.length === 0}
		<p class="empty-state">{m.empty()}</p>
	{:else}
		<div class="stack">
			{#each addons as addon, addonIndex (addon.id)}
				<details
					class="advanced-panel addon-panel"
					ontoggle={(e) => (open[addonIndex] = e.newState === 'open')}
					open={open[addonIndex]}>
					<summary>
						<span class="collapse-summary-name"
							><ChevronRight class="collapse-arrow" size={18} />{displayName(
								addon.name,
								m.empty_addon()
							)}</span>
						<span class="pill">{addon.options.length}</span>
					</summary>
					<div class="stack advanced-content">
						<div class="toolbar addon-actions">
							<button
								class="button-link secondary"
								type="button"
								{disabled}
								onclick={() => duplicateAddon(addonIndex)}
								><Copy size={16} /> {m.duplicate_addon()}</button>
							<button
								class="button-link secondary danger-button"
								type="button"
								{disabled}
								onclick={() => removeAddon(addonIndex)}
								><Trash2 size={16} /> {m.remove()}</button>
						</div>
						<div inert={disabled}>
							<LocalizedField
								value={addon.name}
								labelSv={m.addon_name_sv()}
								labelEn={m.addon_name_en()}
								{suggestions}
								required
								onchange={(name) => updateAddon(addonIndex, { name })} />
						</div>
						<div class="addon-switches" inert={disabled}>
							<label class="switch-field"
								><Switch
									value={addon.required}
									onchange={({ value }) =>
										updateAddon(addonIndex, { required: value })} /><span
									>{m.addon_required()}</span
								></label>
							<label class="switch-field"
								><Switch
									value={addon.multiple_alternatives}
									onchange={({ value }) =>
										updateAddon(addonIndex, {
											multiple_alternatives: value
										})} /><span>{m.addon_multiple_options()}</span></label>
							<label class="switch-field"
								><Switch
									value={addon.has_text_field}
									onchange={({ value }) =>
										updateAddon(addonIndex, { has_text_field: value })} /><span
									>{m.addon_text_field()}</span
								></label>
						</div>
						<div class="toolbar between">
							<h3 class="section-title">{m.addon_options()}</h3>
							<button
								class="button-link secondary"
								type="button"
								{disabled}
								onclick={() => addOption(addonIndex)}
								><Plus size={16} /> {m.add_option()}</button>
						</div>
						{#if addon.options.length === 0}<p class="muted">{m.empty()}</p>{:else}
							<div class="stack">
								{#each addon.options as option, optionIndex (option.id)}
									<details
										class="option-card option-panel"
										ontoggle={(e) => {
											openOptions[addonIndex] = openOptions[addonIndex] ?? []
											openOptions[addonIndex][optionIndex] =
												e.newState === 'open'
										}}
										open={(openOptions[addonIndex] ?? [])[optionIndex]}>
										<summary>
											<span class="collapse-summary-name"
												><ChevronRight
													class="collapse-arrow"
													size={17} />{displayName(
													option.name,
													m.empty_option()
												)}</span>
											<span>{kronor(option.price)}</span>
										</summary>
										<div class="stack option-content">
											<div class="toolbar addon-actions">
												<button
													class="button-link secondary danger-button"
													type="button"
													{disabled}
													onclick={() =>
														removeOption(addonIndex, optionIndex)}
													><Trash2 size={15} /> {m.remove()}</button>
											</div>
											<div class="grid-2" inert={disabled}>
												<LocalizedField
													value={option.name}
													labelSv={m.option_name_sv()}
													labelEn={m.option_name_en()}
													required
													onchange={(name) =>
														updateOption(addonIndex, optionIndex, {
															name
														})} /><MoneyInput
													label={m.option_price()}
													value={option.price}
													onchange={(price) =>
														updateOption(addonIndex, optionIndex, {
															price: price ?? Number.NaN
														})} />
											</div>
											<div class="toolbar between">
												<div>
													<h4 class="section-title">{m.bookkeeping()}</h4>
													<p class="muted">
														{m.bookkeeping_report_help()}
													</p>
													<p class="muted">
														{m.bookkeeping_total({
															total: kronor(
																option.bookkeeping_prices.reduce(
																	(sum, price) => sum + price,
																	0
																)
															),
															price: kronor(option.price)
														})}
													</p>
												</div>
												<button
													class="button-link secondary"
													type="button"
													onclick={() =>
														addCategory(addonIndex, optionIndex)}
													><Plus size={15} />
													{m.add_bookkeeping_category()}</button>
											</div>
											{#each option.bookkeeping_price_categories as category, categoryIndex (`${option.id}-${categoryIndex}`)}<div
													class="bookkeeping-row">
													<BookkeepingCategorySelect
														value={category}
														onchange={(value) =>
															updateCategory(
																addonIndex,
																optionIndex,
																categoryIndex,
																value
															)} /><MoneyInput
														label={m.bookkeeping_amount()}
														value={option.bookkeeping_prices[
															categoryIndex
														]}
														onchange={(price) =>
															updateCategoryPrice(
																addonIndex,
																optionIndex,
																categoryIndex,
																price ?? Number.NaN
															)} /><button
														class="icon-button danger-button"
														type="button"
														aria-label={m.remove()}
														onclick={() =>
															removeCategory(
																addonIndex,
																optionIndex,
																categoryIndex
															)}><Trash2 size={16} /></button>
												</div>{/each}
										</div>
									</details>
								{/each}
							</div>
						{/if}
					</div>
				</details>
			{/each}
		</div>
	{/if}
</section>
