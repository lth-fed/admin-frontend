<script lang="ts">
	import * as m from '$lib/paraglide/messages';

	const CUSTOM_CATEGORY = '__custom__';
	const STANDARD_CATEGORIES = [
		'Vin',
		'Öl',
		'Cider',
		'Annan lågalkoholhaltig dryck',
		'Sprit',
		'Drink',
		'Alkoholfritt',
		'null'
	] as const;
	const standardCategoryValues = new Set<string>(STANDARD_CATEGORIES);

	let {
		value,
		options = [],
		label = m.bookkeeping_category(),
		onchange
	}: {
		value: string;
		options?: string[];
		label?: string;
		onchange: (value: string) => void;
	} = $props();

	const categories = $derived([
		...STANDARD_CATEGORIES,
		...options.filter((option) => option && !standardCategoryValues.has(option))
	]);
	const categoryValues = $derived(new Set<string>(categories));
	const selected = $derived(categoryValues.has(value) ? value : CUSTOM_CATEGORY);

	function select(choice: string): void {
		onchange(choice === CUSTOM_CATEGORY ? (categoryValues.has(value) ? '' : value) : choice);
	}
</script>

<div class="field">
	<span>{label}</span>
	<select value={selected} onchange={(event) => select(event.currentTarget.value)}>
		{#each categories as category (category)}
			<option value={category}>{category === 'null' ? 'Annat' : category}</option>
		{/each}
		<option value={CUSTOM_CATEGORY}>Välj annan...</option>
	</select>
	{#if selected === CUSTOM_CATEGORY}
		<input
			aria-label={m.custom_bookkeeping_category()}
			placeholder={m.custom_bookkeeping_category()}
			{value}
			oninput={(event) => onchange(event.currentTarget.value)} />
	{/if}
</div>
