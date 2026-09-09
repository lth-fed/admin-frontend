import { listVisibleMembers } from '$lib/api/admin';
import type { AdminUser } from '$lib/api/types';

let cachedMembers: Promise<AdminUser[]> | undefined;

/** Shared picker data; names displayed by resource APIs must come from those resources. */
export function loadVisibleMemberOptions(refresh = false): Promise<AdminUser[]> {
	if (refresh || !cachedMembers) cachedMembers = listVisibleMembers();
	return cachedMembers;
}
