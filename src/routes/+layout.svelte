<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/auth.svelte';
	import { getMe, saveLanguage } from '$lib/api/admin';
	import { frontendError } from '$lib/api/client';
	import favicon from '$lib/assets/favicon.svg';
	import ToastStack from '$lib/components/ToastStack.svelte';
	import * as m from '$lib/paraglide/messages';
	import { getLocale, setLocale } from '$lib/paraglide/runtime';
	import { toasts } from '$lib/toasts.svelte';
	import { Button, WillowDark } from '@svar-ui/svelte-core';
	import { CalendarDays, LogOut, Menu, Plus, Users, X } from '@lucide/svelte';
	import './layout.css';

	let { children } = $props();
	let menuOpen = $state(false);
	let hasAdminGroup = $state<boolean | null>(null);
	let adminAccessError = $state<string | null>(null);
	const callbackPage = $derived(page.url.pathname.startsWith('/auth/callback'));

	function supportedLocale(language: string): 'en' | 'sv' | null {
		const primaryLanguage = language.toLowerCase().split('-')[0];
		return primaryLanguage === 'en' || primaryLanguage === 'sv' ? primaryLanguage : null;
	}

	async function persistBrowserLocale(locale: 'en' | 'sv'): Promise<void> {
		await setLocale(locale, { reload: false });
		window.location.replace(window.location.href);
	}

	$effect(() => {
		void auth.initialize();
	});

	$effect(() => {
		if (auth.status === 'authenticated') {
			void (async () => {
				try {
					const me = await getMe();
					const storedLocale = supportedLocale(me.language);
					if (storedLocale && storedLocale !== getLocale()) {
						await persistBrowserLocale(storedLocale);
						return;
					}
					hasAdminGroup = me.admin_group_ids.length > 0;
				} catch (cause) {
					adminAccessError = frontendError(cause) ?? m.error_title();
				}
			})();
		} else {
			hasAdminGroup = null;
			adminAccessError = null;
		}
	});

	async function changeLocale(event: Event): Promise<void> {
		const selector = event.currentTarget as HTMLSelectElement;
		const locale = selector.value as 'en' | 'sv';
		if (locale === getLocale()) return;
		try {
			if (auth.status === 'authenticated') await saveLanguage(locale);
			await persistBrowserLocale(locale);
		} catch (cause) {
			selector.value = getLocale();
			const message = frontendError(cause);
			if (message) toasts.show('error', message);
		}
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>{m.app_name()}</title>
</svelte:head>

<WillowDark>
	{#if callbackPage}
		{@render children()}
	{:else if auth.status === 'loading'}
		<main class="center-stage" aria-live="polite">
			<div class="loader"></div>
			<p>{m.auth_loading()}</p>
		</main>
	{:else if auth.status === 'anonymous'}
		<main class="login-stage">
			<section class="login-card">
				<div class="brand-mark"><CalendarDays size={30} /></div>
				<p class="eyebrow">{m.app_name()}</p>
				<h1>{m.login_title()}</h1>
				<p class="muted">{m.login_description()}</p>
				{#if auth.error}<p class="error-banner">{auth.error}</p>{/if}
				<Button
					type="primary block"
					text={m.login_email()}
					onclick={() => void auth.login(page.url.pathname)} />
				<label class="locale-picker">
					<span>{m.language()}</span>
					<select value={getLocale()} onchange={changeLocale}>
						<option value="sv">{m.swedish()}</option>
						<option value="en">{m.english()}</option>
					</select>
				</label>
			</section>
		</main>
	{:else if hasAdminGroup === null && !adminAccessError}
		<main class="center-stage" aria-live="polite">
			<div class="loader"></div>
			<p>{m.loading()}</p>
		</main>
	{:else if hasAdminGroup === false || adminAccessError}
		<main class="login-stage">
			<section class="login-card">
				<div class="brand-mark"><Users size={30} /></div>
				<h1>{m.no_admin_access_title()}</h1>
				<p class="error-banner" role="alert">{adminAccessError ?? m.no_admin_groups()}</p>
				<Button type="secondary block" text={m.logout()} onclick={() => void auth.logout()} />
			</section>
		</main>
	{:else}
		<div class="app-frame">
			<header class="mobile-header">
				<a class="brand" href={resolve('/')}>{m.app_name()}</a>
				<button class="icon-button" onclick={() => (menuOpen = !menuOpen)} aria-label="Menu">
					{#if menuOpen}<X />{:else}<Menu />{/if}
				</button>
			</header>
			<aside class:open={menuOpen} class="sidebar">
				<a class="sidebar-brand" href={resolve('/')} onclick={() => (menuOpen = false)}>
					<span class="brand-mark small"><CalendarDays size={22} /></span>
					<span>{m.app_name()}</span>
				</a>
				<nav aria-label="Main navigation">
					<a
						class:active={page.url.pathname === '/'}
						href={resolve('/')}
						onclick={() => (menuOpen = false)}>
						<CalendarDays size={19} />
						{m.nav_activities()}
					</a>
					<a
						class:active={page.url.pathname.startsWith('/activities/new')}
						href={resolve('/activities/new')}
						onclick={() => (menuOpen = false)}>
						<Plus size={19} />
						{m.nav_new_activity()}
					</a>
					<a
						class:active={page.url.pathname.startsWith('/groups')}
						href={resolve('/groups')}
						onclick={() => (menuOpen = false)}>
						<Users size={19} />
						{m.nav_groups()}
					</a>
				</nav>
				<div class="sidebar-footer">
					<label class="locale-picker compact">
						<span>{m.language()}</span>
						<select value={getLocale()} onchange={changeLocale}>
							<option value="sv">SV</option>
							<option value="en">EN</option>
						</select>
					</label>
					<button class="nav-button" onclick={() => void auth.logout()}>
						<LogOut size={18} />
						{m.logout()}
					</button>
				</div>
			</aside>
			{#if menuOpen}
				<button class="scrim" aria-label="Close menu" onclick={() => (menuOpen = false)}></button>
			{/if}
			<main class="content">{@render children()}</main>
		</div>
	{/if}
</WillowDark>
<ToastStack />
