<script lang="ts">
	import type { PutTicketNotification } from '$lib/api/types';
	import DateTimePicker from '$lib/components/DateTimePicker.svelte';
	import LocalizedField from '$lib/components/LocalizedField.svelte';
	import * as m from '$lib/paraglide/messages';

	let {
		kind,
		value,
		onkindchange,
		onchange
	}: {
		kind: string;
		value: PutTicketNotification;
		onkindchange: (kind: string) => void;
		onchange: (value: PutTicketNotification) => void;
	} = $props();

	function update(update: Partial<PutTicketNotification>): void {
		onchange({ ...value, ...update });
	}
</script>

<label class="field">
	<span>{m.notification_kind()}</span>
	<input value={kind} oninput={(event) => onkindchange(event.currentTarget.value)} />
</label>
<LocalizedField
	value={value.title}
	labelSv={m.notification_title_sv()}
	labelEn={m.notification_title_en()}
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
