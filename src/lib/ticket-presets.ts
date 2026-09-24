import type { PutTicketKind, TicketKind } from '$lib/api/types';

export const UNLIMITED_TICKETS = 2_147_483_647;
export const ticketPresetIds = ['none', 'free', 'simple', 'allocated', 'advanced'] as const;
export type TicketPresetId = (typeof ticketPresetIds)[number];
type TicketAddon = PutTicketKind['addons'][number];

type PresetShape = Pick<
	PutTicketKind,
	| 'price'
	| 'max_tickets'
	| 'min_tickets'
	| 'allowed_group_ids'
	| 'addons'
	| 'for_visibility'
	| 'transfer_group_ids'
>;

export function createDietaryPreferencesAddon(existingAddons: TicketAddon[] = []): TicketAddon {
	const existing = existingAddons.find(hasDietaryPreferencesName);
	if (existing) return structuredClone(existing);
	const names = [
		{ sv: 'Vegetarian', en: 'Vegetarian' },
		{ sv: 'Vegan', en: 'Vegan' },
		{ sv: 'Nötallergi', en: 'Nut allergy' },
		{ sv: 'Glutenfri', en: 'Gluten-free' },
		{ sv: 'Laktosfri', en: 'Lactose-free' },
		{ sv: 'Maltosallergi', en: 'Maltose allergy' },
		{ sv: 'Mjölkfri', en: 'Milk-free' },
		{ sv: 'Äggallergi', en: 'Egg allergy' },
		{ sv: 'Fläskfri', en: 'Pork-free' },
		{ sv: 'Inget rött kött', en: 'No red meat' },
		{ sv: 'Inga skaldjur', en: 'No shellfish' },
		{ sv: 'Baljväxtsallergi', en: 'Legume allergy' },
		{ sv: 'Svampfritt', en: 'Mushroom-free' },
		{
			sv: 'Svenskt & ekologiskt animaliskt / svenskt viltkött, annars vego',
			en: 'Swedish & organic animal products / Swedish game meat, otherwise vego'
		},
		{ sv: 'Ingen preferens', en: 'No preference' }
	];
	return {
		id: crypto.randomUUID(),
		name: { sv: 'Matpreferens', en: 'Dietary preferences' },
		multiple_alternatives: true,
		has_text_field: true,
		required: false,
		options: names.map((name, idx) => ({
			id: crypto.randomUUID(),
			idx,
			name,
			price: 0,
			bookkeeping_prices: [],
			bookkeeping_price_categories: []
		}))
	};
}

function hasDietaryPreferencesName(addon: TicketAddon): boolean {
	return (
		addon.name.sv.trim().toLocaleLowerCase() === 'matpreferens' &&
		addon.name.en.trim().toLocaleLowerCase() === 'dietary preferences'
	);
}

export function isDietaryPreferencesAddon(addon: TicketAddon): boolean {
	return (
		addon.name.sv === 'Matpreferens' &&
		addon.name.en === 'Dietary preferences' &&
		addon.multiple_alternatives &&
		addon.has_text_field &&
		!addon.required &&
		addon.options.length === 15
	);
}

export function hasDietaryPreferencesAddon(addons: TicketAddon[]): boolean {
	return addons.some(hasDietaryPreferencesName);
}

/** Adds or removes the standard dietary question without touching custom addons. */
export function setDietaryPreferencesAddon(
	addons: TicketAddon[],
	enabled: boolean,
	existingAddons: TicketAddon[] = []
): TicketAddon[] {
	const withoutDietary = addons.filter((addon) => !hasDietaryPreferencesName(addon));
	return enabled
		? [...withoutDietary, createDietaryPreferencesAddon(existingAddons)]
		: withoutDietary;
}

/** Ticket copies reference the same activity-owned add-ons. */
export function copyTicketAddons(addons: TicketAddon[]): TicketAddon[] {
	return structuredClone(addons);
}

/** Copies an add-on with fresh IDs for another activity or a separate definition. */
export function copyTicketAddon(addon: TicketAddon): TicketAddon {
	return {
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
	};
}

/** Selects the least-complex editor that can represent a saved ticket kind without data loss. */
export function detectTicketPreset(ticket: TicketKind): TicketPresetId {
	if (ticket.for_visibility) return 'none';
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
		for_visibility: false,
		transfer_group_ids: [...form.transfer_group_ids],
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
				for_visibility: true,
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
				addons: current.addons
			};
		case 'simple':
			return {
				...current,
				max_tickets:
					current.max_tickets === 0 || current.max_tickets === UNLIMITED_TICKETS
						? 1
						: current.max_tickets,
				min_tickets: 0,
				addons: current.addons
			};
		case 'allocated':
			return {
				...current,
				transfer_group_ids: [...current.allowed_group_ids],
				max_tickets: UNLIMITED_TICKETS,
				min_tickets: Math.max(1, current.min_tickets),
				addons: current.addons
			};
		case 'advanced':
			return current;
	}
}
