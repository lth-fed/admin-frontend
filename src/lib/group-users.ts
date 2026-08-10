import { listGroupUsers } from '$lib/api/admin';
import type { AdminUser } from '$lib/api/types';

let cachedUsers: Promise<AdminUser[]> | null = null;

/** Loads identities from every directly administered group once per page session. */
export function loadGroupUserOptions(refresh = false): Promise<AdminUser[]> {
	if (refresh || !cachedUsers) cachedUsers = listGroupUsers();
	return cachedUsers;
}

export function clearGroupUserOptions(): void {
	cachedUsers = null;
}
