<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { listActivities } from '$lib/api/admin';
	import { frontendError } from '$lib/api/client';
	import type { BriefActivity } from '$lib/api/types';
	import { dateTime, localize } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import {
		Calendar,
		WillowDark as CalendarTheme,
		type CalendarEvent,
		type CalendarInstanceApi
	} from '@svar-ui/svelte-calendar';
	import { Select } from '@svar-ui/svelte-core';
	import { Plus } from '@lucide/svelte';

	let activities = $state<BriefActivity[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let organization = $state('');
	let currentView = $state('month');
	let currentDate = $state(new Date());
	let visibleRange = $state({ start: new Date(), end: new Date() });
	let calendarApi: CalendarInstanceApi | null = null;
	const selectedPeriod = $derived(formatPeriod(currentView, currentDate, visibleRange));

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

		const inclusiveEnd = new Date(range.end.getTime() - 1);
		return new Intl.DateTimeFormat(locale, {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		}).formatRange(range.start, inclusiveEnd);
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

<div class="toolbar between" style="margin-bottom: 14px">
	<div class="toolbar">
		{#if currentView !== 'month'}
			<button class="button-link secondary" onclick={() => changeView('month')}>{m.back()}</button>
		{/if}
		<button class="button-link secondary" onclick={() => navigate('previous')}
			>{m.previous()}</button>
		<button class="button-link secondary" onclick={() => navigate('now')}>{m.today()}</button>
		<button class="button-link secondary" onclick={() => navigate('next')}>{m.next()}</button>
		<Select
			value={currentView}
			options={[
				{ id: 'month', label: m.month() },
				{ id: 'week', label: m.week() },
				{ id: 'day', label: m.day() }
			]}
			onchange={({ value }) => changeView(value)} />
	</div>
	<strong
		class="calendar-period"
		aria-live="polite"
		aria-label={m.selected_period({ period: selectedPeriod })}>{selectedPeriod}</strong>
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
		<CalendarTheme>
			<Calendar
				{events}
				view="month"
				views={['day', 'week', 'month']}
				toolbar={null}
				readonly
				init={initCalendar} />
		</CalendarTheme>
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
