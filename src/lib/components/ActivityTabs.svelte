<script lang="ts" generics="Tab extends string">
	let {
		labels,
		active,
		accessibleLabel,
		furthest = Array.from(labels.keys()).at(-1),
		interactive = true,
		onchange
	}: {
		labels: ReadonlyMap<Tab, string>;
		active: Tab;
		accessibleLabel: string;
		furthest?: Tab;
		interactive?: boolean;
		onchange: (tab: Tab) => void;
	} = $props();

	let tabs = $derived(Array.from(labels.keys()));
	let activeIdx = $derived(tabs.indexOf(active));
	let furthestIdx = $derived(furthest ? tabs.indexOf(furthest) : labels.size - 1);
</script>

<ol class="wizard-steps activity-editor-tabs" aria-label={accessibleLabel}>
	{#each labels.entries() as [tab, label], idx (tab)}
		<li
			class:active={tab === active}
			class:complete={idx < activeIdx}
			aria-current={tab === active ? 'step' : undefined}>
			<button
				type="button"
				disabled={!interactive || idx > furthestIdx}
				onclick={() => onchange(tab)}>
				<span>{idx + 1}</span>{label}
			</button>
		</li>
	{/each}
</ol>
