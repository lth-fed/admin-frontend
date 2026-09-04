<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		type ActivityTab,
		activityTabIndex,
		activityTabUrl,
		isActivityTabNavigation
	} from '$lib/activity-tabs';
	import { getMe, inviteActivityHost, listGroupTree, saveActivity } from '$lib/api/admin';
	import { frontendError } from '$lib/api/client';
	import type { Group, PutActivity } from '$lib/api/types';
	import ActivityDetailsFields from '$lib/components/ActivityDetailsFields.svelte';
	import ActivityLocationFields from '$lib/components/ActivityLocationFields.svelte';
	import ActivityTabs from '$lib/components/ActivityTabs.svelte';
	import GroupTreePicker from '$lib/components/GroupTreePicker.svelte';
	import { uploadImage, uploadRandomColorImage } from '$lib/image';
	import * as m from '$lib/paraglide/messages';
	import { UNLIMITED_TICKETS } from '$lib/ticket-presets';
	import { toasts } from '$lib/toasts.svelte';
	import { ArrowLeft } from '@lucide/svelte';
	import { parseCoordinate } from '$lib/coordinates';

	function initialActivityTimes(): { start: string; end: string } {
		const fallbackStart = new Date(Date.now() + 86_400_000);
		const requestedStart = new Date(page.url.searchParams.get('start') ?? fallbackStart);
		const start = Number.isNaN(requestedStart.getTime()) ? fallbackStart : requestedStart;
		const fallbackEnd = new Date(start.getTime() + 3_600_000);
		const requestedEnd = new Date(page.url.searchParams.get('end') ?? fallbackEnd);
		const end =
			Number.isNaN(requestedEnd.getTime()) || requestedEnd <= start ? fallbackEnd : requestedEnd;
		return { start: start.toISOString(), end: end.toISOString() };
	}

	const initialTimes = initialActivityTimes();

	const activityId = crypto.randomUUID();
	const steps = new Map<ActivityTab, string>([
		['details', m.creation_step_details()],
		['logistics', m.creation_step_logistics()]
	]);
	const stepIds = Array.from(steps.keys());
	let step = $derived(activityTabIndex(page.url, stepIds));
	let loading = $state(true);
	let saving = $state(false);
	let uploading = $state(false);
	let error = $state<string | null>(null);
	let invalidField = $state<string | null>(null);
	let groups = $state<Group[]>([]);
	let adminGroupIds = $state<string[]>([]);
	let imageUrl = $state('');
	let contactKind = $state<'mailto' | 'tel'>('mailto');
	let north = $state('');
	let east = $state('');
	let organizerIds = $state<string[]>([]);
	let savedWizardSnapshot = $state('');
	let allowNavigation = $state(false);
	let activity = $state<PutActivity>({
		responsible_name: '',
		responsible_contact: '',
		creator_id: '',
		title: { sv: '', en: '' },
		description: { sv: '', en: '' },
		location: { name: { sv: '', en: '' }, directions: { sv: '', en: '' }, url: '' },
		time_start: initialTimes.start,
		time_end: initialTimes.end,
		image_id: '',
		is_hidden: true,
		is_hidden_for_other_admins: false,
		max_tickets: UNLIMITED_TICKETS,
		host_ids: []
	});
	const contactValue = $derived(activity.responsible_contact.replace(/^(mailto:|tel:)/, ''));
	const wizardDirty = $derived(
		savedWizardSnapshot !== '' && serializeWizard() !== savedWizardSnapshot
	);

	beforeNavigate(({ cancel, from, to, willUnload }) => {
		if (!wizardDirty || allowNavigation) return;
		if (isActivityTabNavigation(from?.url ?? null, to?.url ?? null)) return;
		if (willUnload) {
			cancel();
			return;
		}
		if (!confirm(m.unsaved_changes())) cancel();
	});

	$effect(() => {
		void load();
	});

	function changeStep(tab: ActivityTab): void {
		if (tab === step) return;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- helper keeps the current resolved route and changes only its tab query
		void goto(activityTabUrl(page.url, tab), { keepFocus: true, noScroll: true });
	}

	function serializeWizard(): string {
		return JSON.stringify({
			activity,
			north,
			east,
			organizerIds
		});
	}

	async function load(): Promise<void> {
		try {
			const [me, tree] = await Promise.all([getMe(), listGroupTree()]);
			groups = tree;
			adminGroupIds = me.admin_group_ids;
			if (adminGroupIds.length === 1) activity.creator_id = adminGroupIds[0];
			activity.responsible_name = me.name;
			if (me.id.startsWith('email:')) activity.responsible_contact = `mailto:${me.id.slice(6)}`;
			savedWizardSnapshot = serializeWizard();
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			loading = false;
		}
	}

	function showError(message: string, field: string | null = null): false {
		error = message;
		invalidField = field;
		toasts.show('error', message);
		return false;
	}

	function validateStep(tab: ActivityTab): boolean {
		error = null;
		invalidField = null;
		if (tab === 'details') {
			if (!activity.creator_id)
				return showError(`${m.creator()}: ${m.required_fields()}`, m.creator());
			if (new Date(activity.time_end) <= new Date(activity.time_start))
				return showError(m.end_after_start(), m.end());
		}
		if (tab === 'logistics') {
			if ((north && !east) || (!north && east))
				return showError(m.coordinates_together(), `${m.latitude()} / ${m.longitude()}`);
			if (north && parseCoordinate(north, 'north') === null)
				return showError(m.invalid_coordinates(), m.latitude());
			if (east && parseCoordinate(east, 'east') === null)
				return showError(m.invalid_coordinates(), m.longitude());
		}
		return true;
	}

	function next(): void {
		if (validateStep(step)) changeStep(stepIds[stepIds.indexOf(step) + 1] ?? 'logistics');
	}

	function updateContactKind(value: string | number): void {
		contactKind = value === 'tel' ? 'tel' : 'mailto';
		activity.responsible_contact = `${contactKind}:${contactValue}`;
	}

	function updateContactValue(value: string): void {
		activity.responsible_contact = `${contactKind}:${value.trim()}`;
	}

	function updateActivity(value: PutActivity): void {
		activity = value;
	}

	function updateStart(value: string): void {
		const duration = Math.max(
			3_600_000,
			new Date(activity.time_end).getTime() - new Date(activity.time_start).getTime()
		);
		activity.time_start = value;
		if (new Date(activity.time_end) <= new Date(value))
			activity.time_end = new Date(new Date(value).getTime() + duration).toISOString();
	}

	async function chooseImage(event: Event): Promise<void> {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		uploading = true;
		error = null;
		try {
			activity.image_id = await uploadImage(file);
			imageUrl = URL.createObjectURL(file);
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			uploading = false;
		}
	}

	async function submit(): Promise<void> {
		for (let index = 0; index < stepIds.length; index += 1) {
			if (validateStep(stepIds[index])) continue;
			changeStep(stepIds[index]);
			return;
		}
		saving = true;
		error = null;
		try {
			if (!activity.image_id) activity.image_id = await uploadRandomColorImage();
			const parsedNorth = parseCoordinate(north, 'north');
			const parsedEast = parseCoordinate(east, 'east');
			await saveActivity(activityId, {
				...activity,
				location: {
					...activity.location,
					url: activity.location.url || undefined,
					coordinate_wgs84:
						typeof parsedNorth === 'number' && typeof parsedEast === 'number'
							? { north: parsedNorth, east: parsedEast }
							: undefined
				},
				host_ids: []
			});
			await Promise.all(organizerIds.map((groupId) => inviteActivityHost(activityId, groupId)));

			allowNavigation = true;
			await goto(resolve('/activities/[id]?tab=tickets', { id: activityId }), {
				replaceState: true
			});
		} catch (cause) {
			allowNavigation = false;
			error = frontendError(cause);
			toasts.show('error', `${m.wizard_partial_failure()} ${error}`);
		} finally {
			saving = false;
		}
	}
</script>

<header class="page-header edit-page-header">
	<div>
		<p class="eyebrow">{m.new_activity()}</p>
		<h1>{m.new_activity()}</h1>
	</div>
	<a class="button-link secondary" href={resolve('/')}><ArrowLeft size={18} /> {m.back()}</a>
</header>

<ActivityTabs
	labels={steps}
	active={step}
	furthest={step}
	interactive={false}
	accessibleLabel={m.new_activity()}
	onchange={changeStep} />

{#if error}<p class="error-banner" role="alert">{error}</p>{/if}
{#if loading}<div class="loader"></div>{:else}
	<form onsubmit={(event) => event.preventDefault()}>
		{#if step === 'details'}
			<ActivityDetailsFields
				value={activity}
				{groups}
				{adminGroupIds}
				{contactKind}
				{contactValue}
				{imageUrl}
				{uploading}
				{invalidField}
				onchange={updateActivity}
				onstartchange={updateStart}
				oncontactkindchange={updateContactKind}
				oncontactvaluechange={updateContactValue}
				onimagechange={(event) => void chooseImage(event)} />
		{:else if step === 'logistics'}
			<div class="stack">
				<ActivityLocationFields
					value={activity.location}
					{north}
					{east}
					{invalidField}
					onchange={(location) => (activity = { ...activity, location })}
					onnorthchange={(value) => (north = value)}
					oneastchange={(value) => (east = value)} />
				<section class="card card-pad stack">
					<div>
						<h2 class="section-title">{m.hosts()}</h2>
						<p class="muted">{m.organizers_after_creation()}</p>
					</div>
					<GroupTreePicker
						title={m.hosts()}
						groups={groups.filter((group) => group.id !== activity.creator_id)}
						selectedIds={organizerIds}
						onchange={(ids) => {
							organizerIds = ids;
						}} />
				</section>
				<section class="card card-pad">
					<p class="muted">{m.configure_tickets_after_creation()}</p>
				</section>
			</div>
		{/if}
		<div class="wizard-actions">
			{#if stepIds.indexOf(step) > 0}<button
					class="button-link secondary"
					type="button"
					onclick={() => changeStep(stepIds[stepIds.indexOf(step) - 1])}>{m.back()}</button
				>{/if}
			{#if stepIds.indexOf(step) < stepIds.length - 1}<button
					class="button-link"
					type="button"
					onclick={next}>{m.continue()}</button
				>{:else}<button
					class="button-link"
					type="button"
					disabled={saving}
					onclick={() => void submit()}>{saving ? m.saving() : m.create_activity()}</button
				>{/if}
		</div>
	</form>
{/if}
