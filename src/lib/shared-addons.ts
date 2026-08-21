import type { PutTicketKind } from '$lib/api/types';
import { applySharedTicketAddon, ticketAddonDataKey } from '$lib/ticket-presets';

type Addon = PutTicketKind['addons'][number];

/** Returns one editable representative for definitions used by multiple ticket kinds. */
export function sharedTicketAddons(addonLists: PutTicketKind['addons'][]): Addon[] {
	const definitions = new Map<string, { addon: Addon; uses: number }>();
	for (const addons of addonLists) {
		const seen = new Set<string>();
		for (const addon of addons) {
			const key = ticketAddonDataKey(addon);
			if (seen.has(key)) continue;
			seen.add(key);
			const definition = definitions.get(key);
			if (definition) definition.uses += 1;
			else definitions.set(key, { addon, uses: 1 });
		}
	}
	return [...definitions.values()]
		.filter(({ uses }) => uses > 1)
		.map(({ addon }) => structuredClone(addon));
}

/** Propagates edits/removals from shared representatives to every matching per-ticket copy. */
export function applySharedAddonChanges(
	addonLists: PutTicketKind['addons'][],
	previous: Addon[],
	next: Addon[]
): PutTicketKind['addons'][] {
	return addonLists.map((addons) =>
		addons.flatMap((addon) => {
			const shared = previous.find(
				(candidate) => ticketAddonDataKey(candidate) === ticketAddonDataKey(addon)
			);
			if (!shared) return [addon];
			const replacement = next.find((candidate) => candidate.id === shared.id);
			return replacement ? [applySharedTicketAddon(replacement, addon)] : [];
		})
	);
}
