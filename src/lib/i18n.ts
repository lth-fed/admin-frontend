import { getLocale } from '$lib/paraglide/runtime';

export type Localized = Record<string, string>;

export function localize(value: Localized | undefined, fallback = '—'): string {
	if (!value) return fallback;
	const locale = getLocale();
	return value[locale] ?? value.sv ?? value.en ?? Object.values(value)[0] ?? fallback;
}

export function dateTime(value: string | Date): string {
	return new Intl.DateTimeFormat(getLocale(), {
		dateStyle: 'medium',
		timeStyle: 'short'
	}).format(new Date(value));
}

export function kronor(valueInOre: number): string {
	return new Intl.NumberFormat(getLocale(), {
		style: 'currency',
		currency: 'SEK',
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	}).format(valueInOre / 100);
}

export function dateInput(value: string): string {
	const date = new Date(value);
	const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
	return local.toISOString().slice(0, 16);
}

export function inputDate(value: string): string {
	return new Date(value).toISOString();
}
