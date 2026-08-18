<script lang="ts">
	import type { Group, PutActivity } from '$lib/api/types';
	import DateTimePicker from '$lib/components/DateTimePicker.svelte';
	import LocalizedField from '$lib/components/LocalizedField.svelte';
	import { localize } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { Select } from '@svar-ui/svelte-core';

	let {
		value,
		groups,
		adminGroupIds,
		creatorReadonly = false,
		creatorName = '',
		invalidField = null,
		contactKind,
		contactValue,
		imageUrl,
		uploading,
		onchange,
		onstartchange,
		oncontactkindchange,
		oncontactvaluechange,
		onimagechange
	}: {
		value: PutActivity;
		groups: Group[];
		adminGroupIds: string[];
		creatorReadonly?: boolean;
		creatorName?: string;
		invalidField?: string | null;
		contactKind: 'mailto' | 'tel';
		contactValue: string;
		imageUrl: string;
		uploading: boolean;
		onchange: (value: PutActivity) => void;
		onstartchange: (value: string) => void;
		oncontactkindchange: (value: string | number) => void;
		oncontactvaluechange: (value: string) => void;
		onimagechange: (event: Event) => void;
	} = $props();
</script>

<section class="card card-pad">
	<h2 class="section-title">{m.activity_details()}</h2>
	<div class="grid-2">
		<LocalizedField
			value={value.title}
			labelSv={m.title_sv()}
			labelEn={m.title_en()}
			required
			errorSv={invalidField === m.title_sv()}
			errorEn={invalidField === m.title_en()}
			onchange={(title) => onchange({ ...value, title })} />
		<LocalizedField
			value={value.description}
			labelSv={m.description_sv()}
			labelEn={m.description_en()}
			multiline
			required
			errorSv={invalidField === m.description_sv()}
			errorEn={invalidField === m.description_en()}
			onchange={(description) => onchange({ ...value, description })} />
		<DateTimePicker label={m.start()} value={value.time_start} onchange={onstartchange} />
		<DateTimePicker
			label={m.end()}
			value={value.time_end}
			error={invalidField === m.end() || new Date(value.time_end) <= new Date(value.time_start)}
			onchange={(time_end) => onchange({ ...value, time_end })} />
		<label class:field-error={invalidField === m.responsible_name()} class="field"
			><span>{m.responsible_name()}</span><input
				required
				aria-invalid={invalidField === m.responsible_name()}
				value={value.responsible_name}
				oninput={(event) =>
					onchange({ ...value, responsible_name: event.currentTarget.value })} /></label>
		<div class:field-error={invalidField === m.responsible_contact()} class="field">
			<span>{m.responsible_contact()}</span>
			<div class="contact-inputs">
				<Select
					value={contactKind}
					options={[
						{ id: 'mailto', label: m.email() },
						{ id: 'tel', label: m.telephone() }
					]}
					onchange={({ value: kind }) => oncontactkindchange(kind)} />
				<input
					required
					aria-invalid={invalidField === m.responsible_contact()}
					type={contactKind === 'mailto' ? 'email' : 'tel'}
					placeholder={contactKind === 'mailto' ? 'admin@example.org' : '+46 70 123 45 67'}
					value={contactValue}
					oninput={(event) => oncontactvaluechange(event.currentTarget.value)} />
			</div>
		</div>
		<div class:field-error={invalidField === m.creator()} class="field flex! flex-col">
			<span>{m.creator()}</span>
			{#if creatorReadonly}
				<div class="readonly-value">
					<strong>{creatorName || value.creator_id}</strong>
					<small>{m.creator_immutable()}</small>
				</div>
			{:else}
				<Select
					value={value.creator_id}
					options={groups
						.filter((group) => adminGroupIds.includes(group.id))
						.map((group) => ({ id: group.id, label: localize(group.name, group.path) }))}
					onchange={({ value: creator_id }) =>
						onchange({ ...value, creator_id: String(creator_id) })} />
			{/if}
		</div>
		<div
			class:field-error={invalidField === m.activity_image()}
			class="field activity-details-image">
			<h2 class="section-title">{m.activity_image()}</h2>
			{#if imageUrl}<div class="activity-image-preview">
					<img src={imageUrl} alt={m.current_activity_image()} /><span
						>{m.current_activity_image()}</span>
				</div>{/if}
			<label class="field"
				><span>{uploading ? m.uploading_image() : m.choose_image()}</span><input
					type="file"
					accept="image/jpeg,image/png,image/webp,image/avif,image/svg+xml"
					onchange={onimagechange} /></label>
		</div>
	</div>
</section>
