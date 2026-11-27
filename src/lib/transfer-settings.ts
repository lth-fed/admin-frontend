export const TRANSFER_START = '1970-01-01T00:00:00.000Z';
export const TRANSFER_STOP = '3000-01-01T00:00:00.000Z';

export function sameGroups(a: string[], b: string[]): boolean {
	return [...new Set(a)].sort().join('|') === [...new Set(b)].sort().join('|');
}

/**
 * Default transfer recipients for an extra ticket kind: the buyer groups of the activity's base
 * ticket. Extra kinds are only sold to base-ticket buyers, so they may be transferred to them.
 */
export function defaultTransferGroups(baseAllowedGroupIds: string[]): string[] {
	return [...new Set(baseAllowedGroupIds)];
}

export function hasTransferWindow(start: string, stop: string): boolean {
	return (
		new Date(start).getTime() !== new Date(TRANSFER_START).getTime() ||
		new Date(stop).getTime() !== new Date(TRANSFER_STOP).getTime()
	);
}
