import { dev } from '$app/environment';

import type { Group } from '$lib/api/types';

const TICKET_RELEASE_LEAD_MS = dev ? 0 : 10 * 60 * 1_000;

export function defaultActivityVisibility(groups: Group[], creatorId: string): string[] {
	const creator = groups.find((group) => group.id === creatorId);
	if (!creator) return [];
	const path = creator.path.split('.');
	if (path.length < 2) return [];
	const guildPath = path.slice(0, 2).join('.');
	const guild = groups.find((group) => group.path === guildPath);
	return guild ? [guild.id] : [];
}

export function defaultTicketRelease(): string {
	// Leave enough time to fill in the form without the default becoming invalid.
	return new Date(Date.now() + (dev ? 60 * 1_000 : 15 * 60 * 1_000)).toISOString();
}

export function ticketReleaseIsTooSoon(value: string, now = Date.now()): boolean {
	const release = new Date(value).getTime();
	return !Number.isFinite(release) || release < now + TICKET_RELEASE_LEAD_MS;
}
