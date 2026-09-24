export const TRANSFER_START = '1970-01-01T00:00:00.000Z';
export const TRANSFER_STOP = '3000-01-01T00:00:00.000Z';

type TransferKind = {
	for_visibility: boolean;
	min_tickets: number;
	allowed_group_ids: string[];
	transfer_group_ids: string[];
};

export function sameGroups(a: string[], b: string[]): boolean {
	return [...new Set(a)].sort().join('|') === [...new Set(b)].sort().join('|');
}

export function defaultTransferGroups(kind: TransferKind, kinds: TransferKind[]): string[] {
	return [
		...new Set(
			kind.min_tickets > 0
				? kind.allowed_group_ids
				: kinds.filter((item) => !item.for_visibility).flatMap((item) => item.allowed_group_ids)
		)
	];
}

export function hasDefaultTransferGroups(kind: TransferKind, kinds: TransferKind[]): boolean {
	return sameGroups(kind.transfer_group_ids, defaultTransferGroups(kind, kinds));
}

export function updatedDefaultTransferGroups(
	kind: TransferKind,
	before: TransferKind[],
	after: TransferKind[]
): string[] | undefined {
	if (kind.for_visibility || !hasDefaultTransferGroups(kind, before)) return undefined;
	const groups = defaultTransferGroups(kind, after);
	return sameGroups(kind.transfer_group_ids, groups) ? undefined : groups;
}

export function defaultTransferGroupUpdates<T extends TransferKind & { ticket_kind_id: string }>(
	before: T[],
	after: TransferKind[],
	excludeId?: string
): Map<string, string[]> {
	const updates = new Map<string, string[]>();
	for (const kind of before) {
		if (kind.ticket_kind_id === excludeId) continue;
		const groups = updatedDefaultTransferGroups(kind, before, after);
		if (groups !== undefined) updates.set(kind.ticket_kind_id, groups);
	}
	return updates;
}

export function hasTransferWindow(start: string, stop: string): boolean {
	return (
		new Date(start).getTime() !== new Date(TRANSFER_START).getTime() ||
		new Date(stop).getTime() !== new Date(TRANSFER_STOP).getTime()
	);
}
