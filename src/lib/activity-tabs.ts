export const activityTabIds = ['details', 'logistics', 'tickets', 'notifications'] as const;

export function activityTabIndex(url: URL): number {
	const index = activityTabIds.indexOf(
		url.searchParams.get('tab') as (typeof activityTabIds)[number]
	);
	return index === -1 ? 0 : index;
}

export function activityTabUrl(url: URL, index: number): URL {
	const next = new URL(url);
	next.searchParams.set('tab', activityTabIds[index] ?? activityTabIds[0]);
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
