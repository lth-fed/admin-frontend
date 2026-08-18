export const groupTabIds = ['details', 'notifications', 'members', 'administrators'] as const;

export function groupTabIndex(url: URL): number {
	const index = groupTabIds.indexOf(url.searchParams.get('tab') as (typeof groupTabIds)[number]);
	return index === -1 ? 0 : index;
}

export function groupTabUrl(url: URL, index: number): URL {
	const next = new URL(url);
	next.searchParams.set('tab', groupTabIds[index] ?? groupTabIds[0]);
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
