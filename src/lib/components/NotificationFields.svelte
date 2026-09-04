<script lang="ts">
	import type { PutNotification } from '$lib/api/types';
	import DateTimePicker from '$lib/components/DateTimePicker.svelte';
	import LocalizedField from '$lib/components/LocalizedField.svelte';
	import * as m from '$lib/paraglide/messages';

	let {
		kind,
		sender,
		value,
		onkindchange,
		onchange
	}: {
		kind?: string;
		sender?: string;
		value: PutNotification;
		onkindchange?: (kind: string) => void;
		onchange: (value: PutNotification) => void;
	} = $props();

	function update(update: Partial<PutNotification>): void {
		onchange({ ...value, ...update });
	}
</script>

{#if kind !== undefined && onkindchange}
	<label class="field">
		<span>{m.notification_kind()}</span>
		<input value={kind} oninput={(event) => onkindchange(event.currentTarget.value)} />
	</label>
{/if}
<LocalizedField
	value={value.title}
	labelSv={m.notification_title_sv()}
	labelEn={m.notification_title_en()}
	prefix={sender === undefined ? undefined : `${sender}:`}
	prefixLabel={m.notification_sender()}
	required
	onchange={(title) => update({ title })} />
<LocalizedField
	value={value.content}
	labelSv={m.notification_content_sv()}
	labelEn={m.notification_content_en()}
	multiline
	required
	onchange={(content) => update({ content })} />
<DateTimePicker
	label={m.send_at()}
	value={value.send_at}
	onchange={(send_at) => update({ send_at })} />
