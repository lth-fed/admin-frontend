<script lang="ts">
	let {
		labels,
		active,
		accessibleLabel,
		furthest = labels.length - 1,
		interactive = true,
		onchange
	}: {
		labels: string[];
		active: number;
		accessibleLabel: string;
		furthest?: number;
		interactive?: boolean;
		onchange: (index: number) => void;
	} = $props();
</script>

<ol class="wizard-steps activity-editor-tabs" aria-label={accessibleLabel}>
	{#each labels as label, index (label)}
		<li
			class:active={index === active}
			class:complete={index < active}
			aria-current={index === active ? 'step' : undefined}>
			<button
				type="button"
				disabled={!interactive || index > furthest}
				onclick={() => onchange(index)}>
				<span>{index + 1}</span>{label}
			</button>
		</li>
	{/each}
</ol>
