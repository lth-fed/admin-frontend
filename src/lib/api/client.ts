import createClient from 'openapi-fetch';
import { auth } from '$lib/auth.svelte';
import { apiBaseUrl } from '$lib/config';
import type { paths } from './generated/minilith';
import { toasts } from '$lib/toasts.svelte';

async function authenticatedFetch(input: Request): Promise<Response> {
	const request = input.clone();
	const token = await auth.accessToken();
	if (token) request.headers.set('Authorization', `Bearer ${token}`);
	if (!request.headers.has('Accept')) request.headers.set('Accept', 'application/json');

	const retry = request.clone();
	const response = await fetch(request);
	if (response.status !== 401 || !token) return response;

	const refreshedToken = await auth.refreshAccessToken(token);
	if (!refreshedToken) return response;
	retry.headers.set('Authorization', `Bearer ${refreshedToken}`);
	return fetch(retry);
}

export const api = createClient<paths>({ baseUrl: apiBaseUrl, fetch: authenticatedFetch });

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
