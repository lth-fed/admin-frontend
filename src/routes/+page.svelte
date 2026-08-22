<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		acceptActivityHostInvite,
		declineActivityHostInvite,
		listActivities,
		listActivityHostInvites
	} from '$lib/api/admin';
	import { frontendError } from '$lib/api/client';
	import type { ActivityHostInvite, BriefActivity } from '$lib/api/types';
	import { createCalendarWords, dateTime, localize } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import {
		Calendar,
		WillowDark as CalendarTheme,
		type CalendarEvent,
		type CalendarInstanceApi
	} from '@svar-ui/svelte-calendar';
	import { Locale as CalendarLocale, Select } from '@svar-ui/svelte-core';
	import { Check, ChevronLeft, ChevronRight, Plus, Users, X } from '@lucide/svelte';
	import { SvelteDate, SvelteSet } from 'svelte/reactivity';

	let activities = $state<BriefActivity[]>([]);
	let hostInvites = $state<ActivityHostInvite[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let invitationError = $state<string | null>(null);
	let organization = $state('');
	let currentView = $state('week');
	let currentDate = $state(new Date());
	let visibleRange = $state({ start: new Date(), end: new Date() });
	let calendarApi: CalendarInstanceApi | null = null;
	const respondingInvites = new SvelteSet<string>();
	const selectedPeriod = $derived(formatPeriod(currentView, currentDate, visibleRange));
	const calendarLanguage = getLocale() === 'sv' ? 'sv-SE' : 'en-GB';
	const calendarWords = createCalendarWords(calendarLanguage);
	const calendarViews = [
		{
			id: 'day',
			sections: {
				timeGrid: {
					yScale: { startHour: 8, endHour: 24, ui: { minUnitHeight: 0 } }
				}
			}
		},
		{
			id: 'week',
			sections: {
				timeGrid: {
					yScale: { startHour: 8, endHour: 24, ui: { minUnitHeight: 0 } }
				}
			}
		},
		'month'
	];

	const organizations = $derived(
		[
			...new Map(
				activities.map((activity) => [activity.creator_path, activity.creator_name])
			).entries()
		]
			.map(([path, name]) => ({ path, name: localize(name, path) }))
			.sort((a, b) => a.name.localeCompare(b.name))
	);
	const filtered = $derived(
		activities
			.filter((activity) => !organization || activity.creator_path === organization)
			.sort((a, b) => +new Date(a.time_start) - +new Date(b.time_start))
	);
	const events = $derived<CalendarEvent[]>(
		filtered.map((activity) => ({
			id: activity.id,
			text: localize(activity.title),
			start: new Date(activity.time_start),
			end: new Date(activity.time_end),
			color: activity.is_hidden ? '#3f4541' : '#626b65'
		}))
	);

	$effect(() => {
		void loadHostInvites();
	});

	function inviteKey(invite: ActivityHostInvite): string {
		return `${invite.activity_id}:${invite.group_id}`;
	}

	async function loadHostInvites(): Promise<void> {
		invitationError = null;
		try {
			hostInvites = await listActivityHostInvites();
		} catch (cause) {
			invitationError = frontendError(cause);
		}
	}

	async function respondToInvite(invite: ActivityHostInvite, accept: boolean): Promise<void> {
		const key = inviteKey(invite);
		respondingInvites.add(key);
		invitationError = null;
		try {
			if (accept) await acceptActivityHostInvite(invite.activity_id, invite.group_id);
			else await declineActivityHostInvite(invite.activity_id, invite.group_id);
			hostInvites = hostInvites.filter((candidate) => inviteKey(candidate) !== key);
			if (accept) void load(visibleRange.start, visibleRange.end);
		} catch (cause) {
			invitationError = frontendError(cause);
		} finally {
			respondingInvites.delete(key);
		}
	}

	async function load(start: Date, end: Date): Promise<void> {
		loading = true;
		error = null;
		try {
			activities = await listActivities(start, end);
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			loading = false;
		}
	}

	function weekNumber(date: Date): number {
		const thursday = new SvelteDate(date);
		thursday.setHours(0, 0, 0, 0);
		thursday.setDate(thursday.getDate() + 3 - ((thursday.getDay() + 6) % 7));
		const firstThursday = new SvelteDate(thursday.getFullYear(), 0, 4);
		firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
		return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / 604_800_000);
	}

	function formatPeriod(view: string, date: Date, range: { start: Date; end: Date }): string {
		const locale = getLocale() === 'sv' ? 'sv-SE' : 'en-GB';
		if (view === 'month')
			return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date);
		if (view === 'day')
			return new Intl.DateTimeFormat(locale, {
				weekday: 'long',
				day: 'numeric',
				month: 'long',
				year: 'numeric'
			}).format(date);

		return `${m.week()} ${weekNumber(range.start)}`;
	}

	function initCalendar(api: CalendarInstanceApi): void {
		calendarApi = api;
		const reload = () => {
			queueMicrotask(() => {
				const state = api.getState();
				currentView = state.currentView;
				currentDate = new Date(state.currentDate);
				visibleRange = {
					start: new Date(state.visibleDateRange.start),
					end: new Date(state.visibleDateRange.end)
				};
				void load(visibleRange.start, visibleRange.end);
			});
		};
		api.on('navigate-time', reload);
		api.on('navigate-to', reload);
		api.on('select-event', (event) => {
			if ('id' in event && event.id)
				void goto(resolve('/activities/[id]', { id: String(event.id) }));
		});
		const state = api.getState();
		currentView = state.currentView;
		currentDate = new Date(state.currentDate);
		visibleRange = {
			start: new Date(state.visibleDateRange.start),
			end: new Date(state.visibleDateRange.end)
		};
		void load(visibleRange.start, visibleRange.end);
	}

	function navigate(direction: 'previous' | 'next' | 'now'): void {
		void calendarApi?.exec('navigate-time', { direction });
	}

	function changeView(value: string | number): void {
		void calendarApi?.exec('navigate-to', { view: String(value) });
	}
</script>

<svelte:head><title>{m.activities_title()} · {m.app_name()}</title></svelte:head>

<header class="page-header">
	<div>
		<p class="eyebrow">{m.nav_activities()}</p>
		<h1>{m.activities_title()}</h1>
		<p class="muted">{m.activities_description()}</p>
	</div>
	<a class="button-link" href={resolve('/activities/new')}><Plus size={18} /> {m.new_activity()}</a>
</header>

{#if invitationError}<p class="error-banner" role="alert">{invitationError}</p>{/if}
{#if hostInvites.length > 0}
	<section class="card card-pad host-invitations">
		<div class="section-heading">
			<div>
				<h2 class="section-title"><Users size={19} /> {m.host_invitations()}</h2>
				<p class="muted">{m.host_invitations_description()}</p>
			</div>
			<span class="pill">{hostInvites.length}</span>
		</div>
		<ul class="list">
			{#each hostInvites as invite (inviteKey(invite))}
				<li>
					<div class="list-main">
						<strong>{localize(invite.activity_title)}</strong>
						<span>{dateTime(invite.activity_time_start)}</span>
						<span
							>{m.host_invitation_group({
								group: localize(invite.group_name, invite.group_path)
							})}</span>
						<span>{m.host_invitation_from({ creator: localize(invite.creator_name) })}</span>
					</div>
					<div class="toolbar">
						<button
							class="button-link"
							type="button"
							disabled={respondingInvites.has(inviteKey(invite))}
							onclick={() => void respondToInvite(invite, true)}>
							<Check size={16} />
							{m.accept()}
						</button>
						<button
							class="button-link secondary"
							type="button"
							disabled={respondingInvites.has(inviteKey(invite))}
							onclick={() => void respondToInvite(invite, false)}>
							<X size={16} />
							{m.decline()}
						</button>
					</div>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<div class="toolbar between" style="margin-bottom: 14px">
	<div class="grid grid-cols-2 items-center">
		<button class="button-link secondary" onclick={() => navigate('now')}>{m.today()}</button>
		<Select
			value={currentView}
			options={[
				{ id: 'month', label: m.month() },
				{ id: 'week', label: m.week() },
				{ id: 'day', label: m.day() }
			]}
			onchange={({ value }) => changeView(value)} />
	</div>
	<div class="calendar-period-navigation">
		<button
			class="icon-button"
			type="button"
			aria-label={m.previous()}
			onclick={() => navigate('previous')}><ChevronLeft size={21} /></button>
		<strong
			class="calendar-period"
			aria-live="polite"
			aria-label={m.selected_period({ period: selectedPeriod })}>{selectedPeriod}</strong>
		<button class="icon-button" type="button" aria-label={m.next()} onclick={() => navigate('next')}
			><ChevronRight size={21} /></button>
	</div>
	<div class="field" style="min-width: 240px">
		<span>{m.filter_organization()}</span>
		<Select
			value={organization}
			options={[
				{ id: '', label: m.all_organizations() },
				...organizations.map((item) => ({ id: item.path, label: item.name }))
			]}
			onchange={({ value }) => (organization = String(value))} />
	</div>
</div>

{#if error}<p class="error-banner" role="alert">{error}</p>{/if}

<div class="agenda-grid">
	<section class="card calendar-shell" aria-label={m.calendar()} class:loading>
		<CalendarLocale words={calendarWords}>
			<CalendarTheme>
				<Calendar
					{events}
					view="week"
					views={calendarViews}
					toolbar={null}
					readonly
					init={initCalendar} />
			</CalendarTheme>
		</CalendarLocale>
	</section>
	<section class="card card-pad agenda-list">
		<h2 class="section-title">{m.agenda()}</h2>
		{#if loading && activities.length === 0}
			<div class="loader"></div>
		{:else if filtered.length === 0}
			<p class="empty-state">{m.no_activities()}</p>
		{:else}
			{#each filtered as activity (activity.id)}
				<a class="agenda-item" href={resolve('/activities/[id]', { id: activity.id })}>
					<time>{dateTime(activity.time_start)}</time>
					<strong>{localize(activity.title)}</strong>
					<span>{localize(activity.creator_name, activity.creator_path)}</span>
					{#if activity.is_hidden}<span class="pill hidden">{m.hidden()}</span>{/if}
				</a>
			{/each}
		{/if}
	</section>
</div>
