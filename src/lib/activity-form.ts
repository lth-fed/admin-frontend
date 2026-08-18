import { dev } from '$app/environment';

import type { Group } from '$lib/api/types';

const TICKET_RELEASE_LEAD_MS = dev ? 0 : 10 * 60 * 1_000;

export function defaultActivityVisibility(groups: Group[], creatorId: string): string[] {
	const creator = groups.find((group) => group.id === creatorId);
	return creator?.path.split('.').length === 2 ? [creator.id] : [];
}

export function defaultTicketRelease(): string {
	// Leave enough time to fill in the form without the default becoming invalid.
	return new Date(Date.now() + (dev ? 0 : 15 * 60 * 1_000)).toISOString();
}

export function ticketReleaseIsTooSoon(value: string, now = Date.now()): boolean {
	return !dev && new Date(value).getTime() < now + TICKET_RELEASE_LEAD_MS;
}
