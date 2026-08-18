import type { PutTicketKind, TicketKind } from '$lib/api/types';

export const UNLIMITED_TICKETS = 2_147_483_647;
export const ticketPresetIds = ['none', 'free', 'simple', 'allocated', 'advanced'] as const;
export type TicketPresetId = (typeof ticketPresetIds)[number];
type TicketAddon = PutTicketKind['addons'][number];

type PresetShape = Pick<
	PutTicketKind,
	'price' | 'max_tickets' | 'min_tickets' | 'allowed_group_ids' | 'addons'
>;

export function createDietaryPreferencesAddon(): TicketAddon {
	return {
		id: crypto.randomUUID(),
		name: { sv: 'Matpreferens', en: 'Dietary preferences' },
		multiple_alternatives: false,
		has_text_field: true,
		required: false,
		options: []
	};
}

export function isDietaryPreferencesAddon(addon: TicketAddon): boolean {
	return (
		addon.name.sv === 'Matpreferens' &&
		addon.name.en === 'Dietary preferences' &&
		!addon.multiple_alternatives &&
		addon.has_text_field &&
		!addon.required &&
		addon.options.length === 0
	);
}

export function hasDietaryPreferencesAddon(addons: TicketAddon[]): boolean {
	return addons.some(isDietaryPreferencesAddon);
}

/** Adds or removes the standard dietary question without touching custom addons. */
export function setDietaryPreferencesAddon(addons: TicketAddon[], enabled: boolean): TicketAddon[] {
	const withoutDietary = addons.filter((addon) => !isDietaryPreferencesAddon(addon));
	return enabled ? [...withoutDietary, createDietaryPreferencesAddon()] : withoutDietary;
}

/** Copies addons with fresh IDs so they can belong to an independent ticket kind. */
export function copyTicketAddons(addons: TicketAddon[]): TicketAddon[] {
	return addons.map((addon) => ({
		...addon,
		id: crypto.randomUUID(),
		name: { ...addon.name },
		options: addon.options.map((option) => ({
			...option,
			id: crypto.randomUUID(),
			name: { ...option.name },
			bookkeeping_prices: [...option.bookkeeping_prices],
			bookkeeping_price_categories: [...option.bookkeeping_price_categories]
		}))
	}));
}

function addonsWithDietaryPreferencesDefault(addons: TicketAddon[]): TicketAddon[] {
	return addons.length > 0 ? addons : [createDietaryPreferencesAddon()];
}

/** Selects the least-complex editor that can represent a saved ticket kind without data loss. */
export function detectTicketPreset(ticket: TicketKind): TicketPresetId {
	if (
		ticket.price === 0 &&
		ticket.max_tickets === 0 &&
		ticket.min_tickets === 0 &&
		ticket.available_addons.length === 0
	)
		return 'none';
	if (
		ticket.price === 0 &&
		ticket.min_tickets === 0 &&
		(ticket.available_addons.length === 0 ||
			(ticket.available_addons.length === 1 &&
				isDietaryPreferencesAddon(ticket.available_addons[0]))) &&
		ticket.max_tickets !== UNLIMITED_TICKETS
	)
		return 'free';
	if (
		ticket.min_tickets > 0 &&
		ticket.max_tickets === UNLIMITED_TICKETS &&
		ticket.allowed_group_ids.length > 0
	)
		return 'allocated';
	if (ticket.min_tickets === 0 && ticket.max_tickets !== UNLIMITED_TICKETS) return 'simple';
	return 'advanced';
}

/** Applies only the invariants owned by a preset; shared dates and transfer settings are retained. */
export function applyTicketPreset(form: PutTicketKind, preset: TicketPresetId): PresetShape {
	const current = {
		price: form.price,
		max_tickets: form.max_tickets,
		min_tickets: form.min_tickets,
		allowed_group_ids: [...form.allowed_group_ids],
		addons: form.addons.map((addon) => ({
			...addon,
			name: { ...addon.name },
			options: addon.options.map((option) => ({
				...option,
				name: { ...option.name },
				bookkeeping_prices: [...option.bookkeeping_prices],
				bookkeeping_price_categories: [...option.bookkeeping_price_categories]
			}))
		}))
	};
	switch (preset) {
		case 'none':
			return {
				...current,
				price: 0,
				max_tickets: 0,
				min_tickets: 0,
				allowed_group_ids: current.allowed_group_ids.slice(0, 1),
				addons: []
			};
		case 'free':
			return {
				...current,
				price: 0,
				max_tickets: current.max_tickets === UNLIMITED_TICKETS ? 1 : current.max_tickets,
				min_tickets: 0,
				addons: [createDietaryPreferencesAddon()]
			};
		case 'simple':
			return {
				...current,
				max_tickets:
					current.max_tickets === 0 || current.max_tickets === UNLIMITED_TICKETS
						? 1
						: current.max_tickets,
				min_tickets: 0,
				addons: addonsWithDietaryPreferencesDefault(current.addons)
			};
		case 'allocated':
			return {
				...current,
				max_tickets: UNLIMITED_TICKETS,
				min_tickets: Math.max(1, current.min_tickets),
				addons: addonsWithDietaryPreferencesDefault(current.addons)
			};
		case 'advanced':
			return current;
	}
}
