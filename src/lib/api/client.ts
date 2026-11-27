import createClient from 'openapi-fetch';
import { auth } from '$lib/auth.svelte';
import { apiBaseUrl } from '$lib/config';
import type { components, paths } from './generated/minilith';
import type { AdminPurchaseHistoryStep, AdminPurchaseRow, SoldProduct } from './types';
import { toasts } from '$lib/toasts.svelte';

export async function authenticatedFetch(input: Request): Promise<Response> {
	const request = input.clone();
	const token = await auth.accessToken();
	if (token) request.headers.set('Authorization', `Bearer ${token}`);
	if (!request.headers.has('Accept')) request.headers.set('Accept', 'application/json');

	const retry = request.clone();
	const response = await fetch(request, { credentials: 'include' });
	if (response.status !== 401 || !token) return response;

	const refreshedToken = await auth.refreshAccessToken(token);
	if (!refreshedToken) return response;
	retry.headers.set('Authorization', `Bearer ${refreshedToken}`);
	return fetch(retry, { credentials: 'include' });
}

// Remove this extension once the server's OpenAPI schema has been regenerated.
type ActivityItemPaths = {
	'/v0/admin/activities/{activity_id}/products/{product_id}': {
		put: {
			parameters: { path: { activity_id: string; product_id: string } };
			responses: { 200: { content?: never } };
		};
	};
};

// Remove this extension once the server's OpenAPI schema has been regenerated.
type StockPaths = {
	'/v0/admin/groups/{group_id}/stock-transactions/inventory-reset': {
		post: {
			parameters: { path: { group_id: string } };
			responses: {
				200: { content: { 'application/json; charset=utf-8': string | null } };
			};
		};
	};
	'/v0/admin/stock-transactions/{id}/replenish-sales-stock': {
		post: {
			parameters: { path: { id: string } };
			responses: { 200: { content: { 'application/json; charset=utf-8': number } } };
		};
	};
};

// Remove this extension once the server's OpenAPI schema has been regenerated.
type MergedAddonPaths = {
	'/v0/admin/addons': {
		get: {
			parameters: { query: { activity_id?: string; product_id?: string } };
			responses: {
				200: {
					content: { 'application/json; charset=utf-8': components['schemas']['AvailableAddon'][] };
				};
			};
		};
		put: {
			parameters: { query: { activity_id?: string; product_id?: string } };
			requestBody: {
				content: { 'application/json; charset=utf-8': components['schemas']['AvailableAddon'] };
			};
			responses: { 200: { content?: never } };
		};
	};
	'/v0/admin/addons/{addon_id}': {
		delete: {
			parameters: { path: { addon_id: string } };
			responses: { 200: { content?: never } };
		};
	};
};

// Remove this extension once the server's OpenAPI schema has been regenerated.
type PurchasePaths = {
	'/v0/admin/purchases': {
		get: {
			parameters: {
				query: { group_id?: string; activity_id?: string; start?: string; end?: string };
			};
			responses: {
				200: {
					content: { 'application/json; charset=utf-8': AdminPurchaseRow[] };
				};
			};
		};
	};
	'/v0/admin/purchases/sold': {
		get: {
			parameters: {
				query: { group_id?: string; activity_id?: string; start?: string; end?: string };
			};
			responses: {
				200: {
					content: { 'application/json; charset=utf-8': SoldProduct[] };
				};
			};
		};
	};
	'/v0/admin/purchases/{id}/history': {
		get: {
			parameters: { path: { id: string } };
			responses: {
				200: {
					content: { 'application/json; charset=utf-8': AdminPurchaseHistoryStep[] };
				};
			};
		};
	};
	'/v0/admin/purchases/{id}/receipt': {
		get: {
			parameters: { path: { id: string } };
			responses: { 200: { content: { 'application/octet-stream': Blob } } };
		};
		post: {
			parameters: { path: { id: string } };
			requestBody: {
				content: { 'application/json; charset=utf-8': { email: string } };
			};
			responses: { 200: { content?: never } };
		};
	};
};

export const api = createClient<
	paths & ActivityItemPaths & StockPaths & MergedAddonPaths & PurchasePaths
>({
	baseUrl: apiBaseUrl,
	fetch: authenticatedFetch
});

export class ApiError extends Error {
	constructor(
		message: string,
		readonly field?: string,
		readonly status?: number
	) {
		super(message);
	}
}

export function responseData<T>(response: { data?: T; error?: unknown; response: Response }): T {
	if (response.error !== undefined || !response.response.ok) {
		const error = response.error as { message?: string; field?: string } | undefined;
		const apiError = new ApiError(
			error?.message ?? `Request failed (${response.response.status})`,
			error?.field,
			response.response.status
		);
		toasts.show(
			'error',
			apiError.field ? `${apiError.field}: ${apiError.message}` : apiError.message
		);
		throw apiError;
	}
	return response.data as T;
}

export function mutationData<T>(
	response: { data?: T; error?: unknown; response: Response },
	successMessage: string
): T {
	const data = responseData(response);
	toasts.show('success', successMessage);
	return data;
}

export function frontendError(cause: unknown): string | null {
	if (cause instanceof ApiError) return null;
	const message = cause instanceof Error ? cause.message : String(cause);
	toasts.show('error', message);
	return message;
}
