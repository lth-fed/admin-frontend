import createClient from 'openapi-fetch';
import { auth } from '$lib/auth.svelte';
import { apiBaseUrl } from '$lib/config';
import type { paths } from './generated/minilith';
import { toasts } from '$lib/toasts.svelte';

export const api = createClient<paths>({ baseUrl: apiBaseUrl });

api.use({
	async onRequest({ request }) {
		const token = await auth.accessToken();
		if (token) request.headers.set('Authorization', `Bearer ${token}`);
		if (!request.headers.has('Accept')) request.headers.set('Accept', 'application/json');
		return request;
	}
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
