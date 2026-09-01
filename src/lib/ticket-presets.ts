import type { PutTicketKind, TicketKind } from '$lib/api/types';

export const UNLIMITED_TICKETS = 2_147_483_647;
export const ticketPresetIds = ['none', 'free', 'simple', 'allocated', 'advanced'] as const;
export type TicketPresetId = (typeof ticketPresetIds)[number];
type TicketAddon = PutTicketKind['addons'][number];

type PresetShape = Pick<
	PutTicketKind,
	'price' | 'max_tickets' | 'min_tickets' | 'allowed_group_ids' | 'addons'
>;

export function createDietaryPreferencesAddon(existingAddons: TicketAddon[] = []): TicketAddon {
	const existing = existingAddons.find(hasDietaryPreferencesName);
	if (existing?.options.length) return copyTicketAddon(existing);
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
			sv: 'Svenskt & ekologiskt animaliskt / svenskt viltkött, allars vego',
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

/** Copies addons with fresh IDs so they can belong to an independent ticket kind. */
export function copyTicketAddons(addons: TicketAddon[]): TicketAddon[] {
	return addons.map(copyTicketAddon);
}

/** Copies one addon with fresh IDs for reuse by another ticket kind. */
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

/** Identifies frontend-shared addons independently of their per-ticket database IDs. */
export function ticketAddonDataKey(addon: TicketAddon): string {
	return JSON.stringify({
		name: addon.name,
		multiple_alternatives: addon.multiple_alternatives,
		has_text_field: addon.has_text_field,
		required: addon.required,
		options: addon.options.map((option) => ({
			idx: option.idx,
			name: option.name,
			price: option.price,
			bookkeeping_prices: option.bookkeeping_prices,
			bookkeeping_price_categories: option.bookkeeping_price_categories
		}))
	});
}

/** Applies shared addon data while retaining IDs owned by the destination ticket kind. */
export function applySharedTicketAddon(source: TicketAddon, destination: TicketAddon): TicketAddon {
	return {
		...structuredClone(source),
		id: destination.id,
		options: source.options.map((option, index) => ({
			...structuredClone(option),
			id: destination.options[index]?.id ?? crypto.randomUUID(),
			idx: index
		}))
	};
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
