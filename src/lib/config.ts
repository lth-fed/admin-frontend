import { env } from '$env/dynamic/public';

const development = import.meta.env.DEV;

export const apiBaseUrl =
	import.meta.env.VITE_MINILITH_API_URL ??
	env.PUBLIC_MINILITH_API_URL ??
	(development ? 'http://localhost:8000' : 'https://api.teknologappen.se');

export const oidcAuthority =
	import.meta.env.VITE_AUTH_ORIGIN ??
	env.PUBLIC_OIDC_AUTHORITY ??
	(development ? 'http://localhost:8001' : 'https://api.auth.teknologappen.se');

export const oidcClientId = env.PUBLIC_OIDC_CLIENT_ID ?? 'teknologappen';

export function callbackUrl(): string {
	return `${window.location.origin}/auth/callback/`;
}
