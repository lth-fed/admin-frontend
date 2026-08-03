import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import {
	ErrorResponse,
	UserManager,
	WebStorageStateStore,
	type User,
	type UserManagerSettings
} from 'oidc-client-ts';
import { apiBaseUrl, callbackUrl, oidcAuthority, oidcClientId } from '$lib/config';
import * as m from '$lib/paraglide/messages';
import { toasts } from '$lib/toasts.svelte';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

class AuthSession {
	status = $state<AuthStatus>('loading');
	user = $state<User | null>(null);
	error = $state<string | null>(null);
	#manager: UserManager | null = null;
	#initializing: Promise<void> | null = null;

	get manager(): UserManager {
		if (!browser) throw new Error('OIDC is only available in the browser');
		if (this.#manager) return this.#manager;

		const settings: UserManagerSettings = {
			authority: oidcAuthority,
			client_id: oidcClientId,
			redirect_uri: callbackUrl(),
			response_type: 'code',
			scope: 'openid',
			disablePKCE: false,
			loadUserInfo: false,
			automaticSilentRenew: true,
			monitorSession: false,
			stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
			userStore: new WebStorageStateStore({ store: window.localStorage }),
			extraQueryParams: {
				providers: 'email',
				callback_url_v1: `${apiBaseUrl}/user/auth-callback/v1`
			}
		};

		this.#manager = new UserManager(settings);
		this.#manager.events.addUserLoaded((user) => this.#setUser(user));
		this.#manager.events.addUserUnloaded(() => this.#setUser(null));
		this.#manager.events.addSilentRenewError((error) => {
			console.error('OIDC token renewal failed', error);
			this.#reportError(error);
		});
		return this.#manager;
	}

	async initialize(): Promise<void> {
		if (!browser) return;
		if (this.#initializing) return this.#initializing;
		this.#initializing = this.#load();
		return this.#initializing;
	}

	async #load(): Promise<void> {
		try {
			let user = await this.manager.getUser();
			if (user?.expired) user = await this.manager.signinSilent();
			this.#setUser(user);
		} catch (error) {
			this.#reportError(error);
			await this.manager.removeUser();
			this.#setUser(null);
		}
	}

	async login(returnTo = '/'): Promise<void> {
		this.error = null;
		await this.manager.signinRedirect({
			state: { returnTo },
			extraQueryParams: {
				providers: 'email',
				callback_url_v1: `${apiBaseUrl}/user/auth-callback/v1`
			}
		});
	}

	async completeLogin(): Promise<string> {
		this.error = null;
		try {
			const query = new URLSearchParams(window.location.search);
			const nonstandardError = query.get('error_message');
			if (nonstandardError) throw new Error(nonstandardError);

			const user = await this.manager.signinRedirectCallback();
			this.#setUser(user);
			const state = user.state as { returnTo?: unknown } | undefined;
			return typeof state?.returnTo === 'string' && state.returnTo.startsWith('/')
				? state.returnTo
				: '/';
		} catch (error) {
			this.#reportError(error);
			throw error;
		}
	}

	async accessToken(): Promise<string | null> {
		await this.initialize();
		let user = await this.manager.getUser();
		if (!user) return null;
		if (user.expired) {
			try {
				user = await this.manager.signinSilent();
			} catch (error) {
				this.#reportError(error, m.auth_session_expired());
				await this.manager.removeUser();
				this.#setUser(null);
				return null;
			}
		}
		if (!user) return null;
		this.#setUser(user);
		return user.access_token;
	}

	async logout(): Promise<void> {
		await this.manager.removeUser();
		this.#setUser(null);
		await goto(resolve('/'));
	}

	#setUser(user: User | null): void {
		this.user = user;
		this.status = user && !user.expired ? 'authenticated' : 'anonymous';
	}

	#reportError(error: unknown, fallback?: string): void {
		const message =
			error instanceof ErrorResponse
				? (error.error_description ?? error.error ?? error.message)
				: error instanceof Error
					? error.message
					: (fallback ?? String(error));
		this.error = message || fallback || m.auth_failed();
		toasts.show('error', this.error);
	}
}

export const auth = new AuthSession();
