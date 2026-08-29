export const activityTabIds = [
	'details',
	'logistics',
	'tickets',
	'sales',
	'notifications'
] as const;
export type ActivityTab = (typeof activityTabIds)[number];

function isActivityTab(value: string | null): value is ActivityTab {
	return value !== null && activityTabIds.some((tab) => tab === value);
}

export function activityTabIndex(
	url: URL,
	allowed: readonly ActivityTab[] = activityTabIds
): ActivityTab {
	const requested = url.searchParams.get('tab');
	return isActivityTab(requested) && allowed.includes(requested)
		? requested
		: (allowed[0] ?? 'details');
}

export function activityTabUrl(url: URL, tab: ActivityTab): URL {
	const next = new URL(url);
	next.searchParams.set('tab', tab);
	return next;
}

export function isActivityTabNavigation(from: URL | null, to: URL | null): boolean {
	if (!from || !to || from.origin !== to.origin || from.pathname !== to.pathname) return false;
	const normalizedFrom = new URL(from);
	const normalizedTo = new URL(to);
	normalizedFrom.searchParams.delete('tab');
	normalizedTo.searchParams.delete('tab');
	return normalizedFrom.href === normalizedTo.href;
}
