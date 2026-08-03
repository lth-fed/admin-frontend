<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	let {
		title,
		items,
		addLabel = m.user_id(),
		addText = m.add(),
		onadd,
		onremove
	}: {
		title: string;
		items: string[];
		addLabel?: string;
		addText?: string;
		onadd: (value: string) => Promise<void>;
		onremove?: (value: string) => Promise<void>;
	} = $props();
	let value = $state('');
	let busy = $state(false);

	async function add(): Promise<void> {
		if (!value) return;
		busy = true;
		try {
			await onadd(value);
			value = '';
		} finally {
			busy = false;
		}
	}
</script>

<div>
	<h3 class="section-title">{title}</h3>
	<div class="toolbar">
		<label class="field" style="flex: 1"><span>{addLabel}</span><input bind:value /></label><button
			class="button-link secondary"
			type="button"
			disabled={busy || !value}
			onclick={() => void add()}>{addText}</button>
	</div>
	{#if items.length === 0}<p class="muted">{m.empty()}</p>{:else}<ul class="list">
			{#each items as item (item)}<li>
					<code>{item}</code>{#if onremove}<button
							class="button-link secondary danger-button"
							type="button"
							onclick={() => void onremove?.(item)}>{m.remove()}</button
						>{/if}
				</li>{/each}
		</ul>{/if}
</div>
