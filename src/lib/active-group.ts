import type { Group } from './api/types';

/** Remembered group per admin page (e.g. `products`, `stock`, `activities`). */
const storagePrefix = 'fed-admin:active-group:';

/** Groups the caller directly administers, ordered by path. */
export function administrableGroups(groups: Group[], adminGroupIds: string[]): Group[] {
	return groups
		.filter((group) => !group.deleted && adminGroupIds.includes(group.id))
		.sort((a, b) => a.path.localeCompare(b.path));
}

export function storedActiveGroup(pageKey: string): string | null {
	try {
		return window.localStorage.getItem(`${storagePrefix}${pageKey}`);
	} catch {
		return null;
	}
}

export function rememberActiveGroup(pageKey: string, groupId: string): void {
	try {
		if (groupId) window.localStorage.setItem(`${storagePrefix}${pageKey}`, groupId);
		else window.localStorage.removeItem(`${storagePrefix}${pageKey}`);
	} catch {
		// Storage can be unavailable (private mode); the in-memory selection still works.
	}
}

/** Stored group while still administrable, otherwise the first administrable group by path. */
export function resolveActiveGroup(
	pageKey: string,
	groups: Group[],
	adminGroupIds: string[]
): string {
	const candidates = administrableGroups(groups, adminGroupIds);
	const stored = storedActiveGroup(pageKey);
	if (stored && candidates.some((group) => group.id === stored)) return stored;
	return candidates[0]?.id ?? '';
}
