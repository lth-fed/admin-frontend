import type { AvailableAddon } from '$lib/api/types';

type TicketAddon = AvailableAddon;

/**
 * A single free-text add-on for dietary preferences, so the customer can type their own.
 * Option lists live in the customer app, not here.
 */
export function createDietaryPreferencesAddon(existingAddons: TicketAddon[] = []): TicketAddon {
	const existing = existingAddons.find(hasDietaryPreferencesName);
	if (existing) return structuredClone(existing);
	return {
		id: crypto.randomUUID(),
		name: { sv: 'Matpreferens', en: 'Dietary preferences' },
		multiple_alternatives: false,
		has_text_field: true,
		required: false,
		options: []
	};
}

function hasDietaryPreferencesName(addon: TicketAddon): boolean {
	return (
		addon.name.sv.trim().toLocaleLowerCase() === 'matpreferens' &&
		addon.name.en.trim().toLocaleLowerCase() === 'dietary preferences'
	);
}

export function copyTicketAddon(addon: TicketAddon): TicketAddon {
	return { ...structuredClone(addon), id: crypto.randomUUID() };
}
