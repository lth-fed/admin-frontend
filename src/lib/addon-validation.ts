import type { PutTicketKind } from '$lib/api/types';

type Addon = PutTicketKind['addons'][number];

export function validBookkeeping(option: Addon['options'][number]): boolean {
	return (
		option.bookkeeping_prices.length === option.bookkeeping_price_categories.length &&
		option.bookkeeping_price_categories.every((category) => Boolean(category.trim())) &&
		option.bookkeeping_prices.every((price) => Number.isSafeInteger(price) && price >= 0) &&
		option.bookkeeping_prices.reduce((sum, price) => sum + price, 0) === option.price
	);
}

export function validAddons(addons: PutTicketKind['addons']): boolean {
	if (!Array.isArray(addons)) return false;
	const ids = new Set<string>();
	const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
	for (const addon of addons) {
		if (
			!uuid.test(addon.id) ||
			ids.has(addon.id) ||
			!addon.name?.sv?.trim() ||
			!addon.name?.en?.trim() ||
			!Array.isArray(addon.options)
		)
			return false;
		ids.add(addon.id);
		for (const option of addon.options) {
			if (
				!uuid.test(option.id) ||
				ids.has(option.id) ||
				!option.name?.sv?.trim() ||
				!option.name?.en?.trim() ||
				!Number.isSafeInteger(option.price) ||
				option.price < 0 ||
				!validBookkeeping(option)
			)
				return false;
			ids.add(option.id);
		}
	}
	return true;
}
