import type { AdminProduct, AvailableAddon, PutProduct } from './api/types';

/** The backend treats a missing `sales_stock` as "not automatically managed". */
export function emptyProduct(salesTargetId = '', activityId?: string): PutProduct {
	const start = new Date();
	const stop = new Date(Date.now() + 365 * 86_400_000);
	return {
		kind: activityId ? 'ticket' : 'normal',
		image_id: undefined,
		sales_target_id: salesTargetId,
		name: { sv: '', en: '' },
		description: { sv: '', en: '' },
		price: 0,
		sales_stock: 0,
		stock_real: 0,
		stock_unit: 'st',
		stock_price: 0,
		bookkeeping_tag_ids: [],
		bookkeeping_prices: [],
		max_uses: 1,
		sales_start: start.toISOString(),
		sales_stop: stop.toISOString(),
		resale_start: start.toISOString(),
		resale_stop: stop.toISOString(),
		store_general_sales: false,
		store_online_self_serve: false,
		store_internal_id: undefined,
		store_alcohol_by_volume: undefined,
		tickets_guaranteed: false,
		tickets_require_other: false,
		activity_ids: activityId ? [activityId] : [],
		transfer_group_ids: [],
		allowed_group_ids: [],
		addons: []
	};
}

/** Editor representation of a stored product. */
export function productBody(product: AdminProduct, addons: AvailableAddon[]): PutProduct {
	return {
		kind: product.kind,
		image_id: product.image_id,
		sales_target_id: product.sales_target_id,
		name: product.name,
		description: product.description,
		price: product.price,
		sales_stock: product.sales_stock,
		stock_real: product.stock_real,
		stock_unit: product.stock_unit,
		stock_price: product.stock_price,
		bookkeeping_tag_ids: product.bookkeeping_tag_ids ?? [],
		bookkeeping_prices: product.bookkeeping_prices ?? [],
		max_uses: product.max_uses,
		sales_start: product.sales_start,
		sales_stop: product.sales_stop,
		resale_start: product.resale_start,
		resale_stop: product.resale_stop,
		store_general_sales: product.store_general_sales,
		store_online_self_serve: product.store_online_self_serve,
		store_internal_id: product.store_internal_id,
		store_alcohol_by_volume: product.store_alcohol_by_volume,
		tickets_guaranteed: product.tickets_guaranteed,
		tickets_require_other: product.tickets_require_other,
		activity_ids: product.activity_ids,
		transfer_group_ids: product.transfer_group_ids,
		allowed_group_ids: product.allowed_group_ids,
		addons
	};
}

export function isVisibilityProduct(product: AdminProduct): boolean {
	return product.kind === 'activityvisibility';
}

export function linkedAddons(product: AdminProduct, available: AvailableAddon[]): AvailableAddon[] {
	return product.addon_ids
		.map((id) => available.find((addon) => addon.id === id))
		.filter((addon): addon is AvailableAddon => addon !== undefined);
}

export function addonIdsMatch(product: AdminProduct, addons: AvailableAddon[]): boolean {
	const before = [...product.addon_ids].sort().join('|');
	const after = addons
		.map((addon) => addon.id)
		.sort()
		.join('|');
	return before === after;
}
