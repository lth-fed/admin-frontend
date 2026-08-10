import { listAddonNames } from '$lib/api/admin';
import type { PutTicketKind } from '$lib/api/types';

let cachedNames: Promise<PutTicketKind['name'][]> | null = null;

export function loadAddonNameOptions(): Promise<PutTicketKind['name'][]> {
	cachedNames ??= listAddonNames();
	return cachedNames;
}
