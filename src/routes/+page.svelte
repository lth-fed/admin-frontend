<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		acceptActivityHostInvite,
		declineActivityHostInvite,
		listActivities,
		listActivityHostInvites,
		listGroupTree
	} from '$lib/api/admin';
	import { frontendError } from '$lib/api/client';
	import type { ActivityHostInvite, BriefActivity, Group } from '$lib/api/types';
	import GroupTreePicker from '$lib/components/GroupTreePicker.svelte';
	import { createCalendarWords, dateTime, isoWeekNumber, localize } from '$lib/i18n';
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
	let groups = $state<Group[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let invitationError = $state<string | null>(null);
	let organization = $state('');
	let currentView = $state('week');
	let currentDate = new SvelteDate();
	let visibleRange = $state({ start: new SvelteDate(), end: new SvelteDate() });
	let calendarApi: CalendarInstanceApi | null = null;
	let calendarShell: HTMLElement;
	const respondingInvites = new SvelteSet<string>();
	const selectedPeriod = $derived(formatPeriod(currentView, currentDate, visibleRange));
	const calendarLanguage = getLocale() === 'sv' ? 'sv-SE' : 'en-GB';
	const calendarWords = createCalendarWords(calendarLanguage);
	const calendarViews = [
		{
			id: 'day',
			sections: {
				timeGrid: {
					yScale: { startHour: 0, endHour: 24, ui: { minUnitHeight: 0 } },
					ui: { drag: false, dragCreate: true }
				}
			}
		},
		{
			id: 'week',
			sections: {
				timeGrid: {
					yScale: { startHour: 0, endHour: 24, ui: { minUnitHeight: 0 } },
					ui: { drag: false, dragCreate: true }
				}
			}
		},
		{
			id: 'month',
			sections: {
				month: {
					yScale: { visible: true, format: 'weekNumberFormat' },
					ui: { drag: false, dragCreate: true }
				}
			}
		}
	];

	$effect(() => {
		void currentView;
		void visibleRange;
		queueMicrotask(enhanceMonthWeekHeaders);
	});

	const selectedOrganization = $derived(groups.find((group) => group.id === organization));
	const filtered = $derived(
		activities
			.filter(
				(activity) => !selectedOrganization || activity.creator_path === selectedOrganization.path
			)
			.sort((a, b) => +new Date(a.time_start) - +new Date(b.time_start))
	);
	const events = $derived<CalendarEvent[]>(
		filtered.flatMap((activity) => activityCalendarEvents(activity, currentView !== 'month'))
	);

	function activityCalendarEvents(activity: BriefActivity, splitByDay: boolean): CalendarEvent[] {
		const start = new Date(activity.time_start);
		const end = new Date(activity.time_end);
		const base = {
			text: localize(activity.title),
			color: activity.is_hidden ? '#3f4541' : '#626b65'
		};
		if (
			!splitByDay ||
			start.toDateString() === end.toDateString() ||
			end.getTime() - start.getTime() >= 86_400_000
		)
			return [{ id: activity.id, start, end, ...base }];

		const segments: CalendarEvent[] = [];
		const day = new SvelteDate(start);
		day.setHours(0, 0, 0, 0);
		while (day < end) {
			const nextDay = new SvelteDate(day);
			nextDay.setDate(nextDay.getDate() + 1);
			const segmentStart = new Date(Math.max(start.getTime(), day.getTime()));
			const segmentEnd = new Date(Math.min(end.getTime(), nextDay.getTime() - 1));
			if (segmentStart < segmentEnd) {
				segments.push({
					id: `${activity.id}:${day.toISOString().slice(0, 10)}`,
					start: segmentStart,
					end: segmentEnd,
					...base
				});
			}
			day.setDate(day.getDate() + 1);
		}
		return segments;
	}

	function activityIdFromCalendarEvent(id: string | number): string {
		return String(id).split(':', 1)[0];
	}

	function createActivityFromCalendarRange(event: Partial<CalendarEvent>): void {
		if (!(event.start instanceof Date) || !(event.end instanceof Date)) return;
		const query = new URLSearchParams({
			start: event.start.toISOString(),
			end: event.end.toISOString()
		});
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- the route itself is resolved before adding its query string
		void goto(`${resolve('/activities/new')}?${query}`);
	}

	$effect(() => {
		void loadHostInvites();
		void loadGroups();
	});

	async function loadGroups(): Promise<void> {
		try {
			groups = await listGroupTree();
		} catch (cause) {
			error = frontendError(cause);
		}
	}

	function selectOrganization(ids: string[]): void {
		organization = ids.find((id) => id !== organization) ?? ids[0] ?? '';
	}

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

		return `${m.week()} ${isoWeekNumber(range.start)}`;
	}

	function initCalendar(api: CalendarInstanceApi): void {
		calendarApi = api;
		const reload = () => {
			queueMicrotask(() => {
				const state = api.getState();
				currentView = state.currentView;
				currentDate.setTime(new Date(state.currentDate).getTime());
				visibleRange = {
					start: new SvelteDate(state.visibleDateRange.start),
					end: new SvelteDate(state.visibleDateRange.end)
				};
				void load(visibleRange.start, visibleRange.end);
			});
		};
		api.on('navigate-time', reload);
		api.on('navigate-to', reload);
		api.on('select-event', (event) => {
			if ('id' in event && event.id)
				void goto(resolve('/activities/[id]', { id: activityIdFromCalendarEvent(event.id) }));
		});
		api.on('add-event', (action) => {
			if ('event' in action) createActivityFromCalendarRange(action.event);
		});
		const state = api.getState();
		currentView = state.currentView;
		currentDate.setTime(new Date(state.currentDate).getTime());
		visibleRange = {
			start: new SvelteDate(state.visibleDateRange.start),
			end: new SvelteDate(state.visibleDateRange.end)
		};
		void load(visibleRange.start, visibleRange.end);
	}

	function navigate(direction: 'previous' | 'next' | 'now'): void {
		void calendarApi?.exec('navigate-time', { direction });
	}

	function changeView(value: string | number): void {
		void calendarApi?.exec('navigate-to', { view: String(value) });
	}

	function monthWeekHeader(target: EventTarget | null): HTMLElement | null {
		if (currentView !== 'month' || !(target instanceof Element)) return null;
		return target.closest<HTMLElement>('.wx-y-header-cell');
	}

	function openMonthWeek(header: HTMLElement): void {
		const headers = [...calendarShell.querySelectorAll<HTMLElement>('.wx-y-header-cell')];
		const index = headers.indexOf(header);
		if (index < 0) return;
		const date = new SvelteDate(visibleRange.start);
		date.setDate(date.getDate() + index * 7);
		void calendarApi?.exec('navigate-to', { view: 'week', date });
	}

	function enhanceMonthWeekHeaders(): void {
		if (currentView !== 'month' || !calendarShell) return;
		for (const header of calendarShell.querySelectorAll<HTMLElement>('.wx-y-header-cell')) {
			header.role = 'button';
			header.tabIndex = 0;
			header.ariaLabel = `${m.week()} ${header.textContent?.trim() ?? ''}`;
		}
	}

	function handleCalendarClick(event: MouseEvent): void {
		const header = monthWeekHeader(event.target);
		if (header) openMonthWeek(header);
	}

	function handleCalendarKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		const header = monthWeekHeader(event.target);
		if (!header) return;
		event.preventDefault();
		openMonthWeek(header);
	}

	function weekHeaderNavigation(node: HTMLElement): { destroy: () => void } {
		calendarShell = node;
		node.addEventListener('click', handleCalendarClick);
		node.addEventListener('keydown', handleCalendarKeydown);
		return {
			destroy: () => {
				node.removeEventListener('click', handleCalendarClick);
				node.removeEventListener('keydown', handleCalendarKeydown);
			}
		};
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
	<details class="advanced-panel calendar-group-filter">
		<summary>
			{m.filter_organization()}: {selectedOrganization
				? localize(selectedOrganization.name, selectedOrganization.path)
				: m.all_organizations()}
		</summary>
		<div class="stack advanced-content">
			<button class="button-link secondary" type="button" onclick={() => (organization = '')}
				>{m.all_organizations()}</button>
			<GroupTreePicker
				{groups}
				selectedIds={organization ? [organization] : []}
				onchange={selectOrganization} />
		</div>
	</details>
</div>

{#if error}<p class="error-banner" role="alert">{error}</p>{/if}

<div class="agenda-grid">
	<section
		class="card calendar-shell"
		aria-label={m.calendar()}
		class:loading
		use:weekHeaderNavigation>
		<CalendarLocale words={calendarWords}>
			<CalendarTheme>
				<Calendar {events} view="week" views={calendarViews} toolbar={null} init={initCalendar} />
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
