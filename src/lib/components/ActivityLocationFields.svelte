<script lang="ts">
	import type { PutActivity } from '$lib/api/types';
	import LocalizedField from '$lib/components/LocalizedField.svelte';
	import * as m from '$lib/paraglide/messages';

	type Location = PutActivity['location'];

	let {
		value,
		north,
		east,
		onchange,
		onnorthchange,
		oneastchange
	}: {
		value: Location;
		north: string;
		east: string;
		onchange: (value: Location) => void;
		onnorthchange: (value: string) => void;
		oneastchange: (value: string) => void;
	} = $props();
</script>

<section class="card card-pad">
	<div class="section-heading">
		<h2 class="section-title">{m.location()}</h2>
		<p class="muted">{m.location_optional()}</p>
	</div>
	<div class="grid-2">
		<LocalizedField
			value={value.name!}
			labelSv={m.location_sv()}
			labelEn={m.location_en()}
			placeholderSv={m.location_placeholder()}
			placeholderEn={m.location_placeholder()}
			onchange={(name) => onchange({ ...value, name })} />
		<LocalizedField
			value={value.directions!}
			labelSv={m.directions_sv()}
			labelEn={m.directions_en()}
			placeholderSv={m.directions_placeholder()}
			placeholderEn={m.directions_placeholder()}
			multiline
			onchange={(directions) => onchange({ ...value, directions })} />
		<label class="field"
			><span>{m.location_url()}</span><input
				type="url"
				placeholder="https://maps.google.com/…"
				value={value.url ?? ''}
				oninput={(event) => onchange({ ...value, url: event.currentTarget.value })} /></label>
		<div class="grid-2">
			<label class="field"
				><span>{m.latitude()}</span><input
					type="number"
					step="any"
					value={north}
					oninput={(event) => onnorthchange(event.currentTarget.value)} /></label
			><label class="field"
				><span>{m.longitude()}</span><input
					type="number"
					step="any"
					value={east}
					oninput={(event) => oneastchange(event.currentTarget.value)} /></label>
		</div>
	</div>
</section>
