export const groupTabIds = ['details', 'notifications', 'members', 'administrators'] as const;
export type GroupTab = (typeof groupTabIds)[number];

function isGroupTab(value: string | null): value is GroupTab {
	return value !== null && groupTabIds.some((tab) => tab === value);
}

export function groupTabIndex(url: URL): GroupTab {
	const requested = url.searchParams.get('tab');
	return isGroupTab(requested) ? requested : groupTabIds[0];
}

export function groupTabUrl(url: URL, tab: GroupTab): URL {
	const next = new URL(url);
	next.searchParams.set('tab', tab);
	return next;
}

export function isGroupTabNavigation(from: URL | null, to: URL | null): boolean {
	if (!from || !to || from.origin !== to.origin || from.pathname !== to.pathname) return false;
	const normalizedFrom = new URL(from);
	const normalizedTo = new URL(to);
	normalizedFrom.searchParams.delete('tab');
	normalizedTo.searchParams.delete('tab');
	return normalizedFrom.href === normalizedTo.href;
}
