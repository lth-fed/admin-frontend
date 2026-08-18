<script lang="ts">
	import type { Localized } from '$lib/i18n'
	import * as m from '$lib/paraglide/messages'
	import { Switch } from '@svar-ui/svelte-core'
	import { Carta, MarkdownEditor } from 'carta-md'
	import 'carta-md/default.css'
	import 'github-markdown-css/github-markdown.css'
	import sanitizeHtml from 'sanitize-html'
	import { untrack } from 'svelte'

	const MAX_BYTES = 100_000
	const sanitize = (html: string) =>
		sanitizeHtml(html, {
			// Carta also sanitizes its Shiki overlay with this function. Images are
			// already absent from sanitize-html's default tag list, while these
			// attributes are required to retain Carta's syntax highlighting.
			allowedAttributes: {
				...sanitizeHtml.defaults.allowedAttributes,
				a: ['href', 'name', 'target', 'rel'],
				pre: ['class', 'style', 'tabindex'],
				code: ['class', 'style'],
				span: ['class', 'style']
			}
		})
	const createCarta = () => new Carta({ sanitizer: sanitize })
	const swedishCarta = createCarta()
	const englishCarta = createCarta()

	let {
		value,
		labelSv,
		labelEn,
		required = false,
		errorSv = false,
		errorEn = false,
		onchange
	}: {
		value: Localized
		labelSv: string
		labelEn: string
		required?: boolean
		errorSv?: boolean
		errorEn?: boolean
		onchange: (value: Localized) => void
	} = $props()

	let overrideEnglish = $state(
		untrack(() => {
			const swedish = value.sv ?? ''
			const english = value.en ?? ''
			return (swedish === '' && english === '') || swedish !== english
		})
	)
	function limitUtf8(input: string): string {
		const bytes = new TextEncoder().encode(input)
		return bytes.byteLength <= MAX_BYTES
			? input
			: new TextDecoder().decode(bytes.slice(0, MAX_BYTES))
	}

	const rawInitialSwedish = untrack(() => value.sv ?? '')
	const rawInitialEnglish = untrack(() => value.en ?? '')
	let swedish = $state(limitUtf8(rawInitialSwedish))
	let english = $state(limitUtf8(rawInitialEnglish))
	let previousSwedish = rawInitialSwedish
	let previousEnglish = rawInitialEnglish

	$effect(() => {
		const current = swedish
		if (current === previousSwedish) return
		const limited = limitUtf8(current)
		if (limited !== current) {
			swedish = limited
			return
		}
		previousSwedish = limited
		untrack(() => {
			if (!overrideEnglish) {
				english = limited
				previousEnglish = limited
			}
			onchange({ ...value, sv: limited, en: overrideEnglish ? (value.en ?? '') : limited })
		})
	})

	$effect(() => {
		const current = english
		if (current === previousEnglish) return
		const limited = limitUtf8(current)
		if (limited !== current) {
			english = limited
			return
		}
		previousEnglish = limited
		untrack(() => onchange({ ...value, en: limited }))
	})

	function toggleOverride(enabled: boolean): void {
		overrideEnglish = enabled
		if (!enabled) {
			english = swedish
			previousEnglish = swedish
			onchange({ ...value, sv: swedish, en: swedish })
		}
	}
</script>

<div class="localized-field-pair localized-markdown-pair">
	<div class:field-error={errorSv} class="field">
		<span>{labelSv}</span>
		<MarkdownEditor
			bind:value={swedish}
			carta={swedishCarta}
			mode="tabs"
			highlightDelay={0}
			textarea={{
				required,
				maxLength: MAX_BYTES,
				'aria-invalid': errorSv,
				'aria-label': labelSv
			}} />
	</div>
	<div class="localized-english-option">
		<label class="switch-field localized-override">
			<Switch
				value={overrideEnglish}
				onchange={({ value: enabled }) => toggleOverride(enabled)} />
			<span>{m.override_english()}</span>
		</label>
		{#if overrideEnglish}
			<div class:field-error={errorEn} class="field localized-english">
				<span class="visually-hidden">{labelEn}</span>
				<MarkdownEditor
					bind:value={english}
					carta={englishCarta}
					mode="tabs"
					highlightDelay={0}
					textarea={{
						required,
						maxLength: MAX_BYTES,
						'aria-invalid': errorEn,
						'aria-label': labelEn
					}} />
			</div>
		{/if}
	</div>
</div>

<style>
	.localized-markdown-pair {
		grid-column: 1 / -1;
	}

	:global(.carta-font-code) {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.95rem;
		font-weight: 450;
		line-height: 1.4;
		letter-spacing: normal;
		border: none !important;
				border-radius: 0 !important;
	}

	:global(.carta-theme__default) {
		--border-color: var(--border-color-dark);
		--selection-color: var(--selection-color-dark);
		--focus-outline: var(--focus-outline-dark);
		--hover-color: var(--hover-color-dark);
		--caret-color: var(--caret-color-dark);
		--text-color: var(--text-color-dark);
		font-weight: 450;
	}

	:global(.shiki),
	:global(.shiki span) {
	  color: var(--shiki-dark) !important;
	}

	:global(.carta-editor) {
		border: 1px solid #3a403c;
		border-radius: 0.75rem;
		background: #171a18;
		overflow: hidden;
	}

	:global(.carta-theme__default .shiki) {
		background-color: transparent !important;
	}

	:global(.carta-theme__default .carta-input),
	:global(.carta-theme__default .carta-renderer) {
		height: 12rem;
	}

	:global(.carta-theme__default .carta-renderer) {
		--fgColor-accent: #9cb5a8;
		--fgColor-default: #e4e7e5;
		--fgColor-muted: #969d98;
		--bgColor-default: transparent;
		--bgColor-muted: #202521;
		--bgColor-neutral-muted: rgb(113 128 120 / 20%);
		--borderColor-default: #3a403c;
		--borderColor-muted: rgb(58 64 60 / 70%);
		--borderColor-neutral-muted: #3a403c;
		color-scheme: dark;
		background-color: transparent;
		font-synthesis: weight style;
	}
</style>
