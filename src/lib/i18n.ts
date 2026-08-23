import { getLocale } from '$lib/paraglide/runtime';
import * as m from '$lib/paraglide/messages';

export type Localized = Record<string, string>;

export function localize(value: Localized | undefined, fallback = '—'): string {
	if (!value) return fallback;
	const locale = getLocale();
	return value[locale] ?? value.sv ?? value.en ?? Object.values(value)[0] ?? fallback;
}

/** Adds a consistent copy suffix while keeping identical translations identical. */
export function copiedLocalizedTitle(value: Localized): Localized {
	const swedish = `${value.sv ?? ''} (kopia)`;
	return {
		...value,
		sv: swedish,
		en: value.sv === value.en ? swedish : `${value.en ?? value.sv ?? ''} (copy)`
	};
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

export function isoWeekNumber(date: Date): number {
	const thursday = new Date(date);
	thursday.setHours(0, 0, 0, 0);
	thursday.setDate(thursday.getDate() + 3 - ((thursday.getDay() + 6) % 7));
	const firstThursday = new Date(thursday.getFullYear(), 0, 4);
	firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
	return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / 604_800_000);
}

export function createCalendarWords(locale: 'sv-SE' | 'en-GB') {
	const monthFull = Array.from({ length: 12 }, (_, month) =>
		new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(2024, month, 1, 12))
	);
	const monthShort = Array.from({ length: 12 }, (_, month) =>
		new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(2024, month, 1, 12))
	);
	const dayFull = Array.from({ length: 7 }, (_, day) =>
		new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(new Date(2024, 0, 7 + day, 12))
	);
	const dayShort = Array.from({ length: 7 }, (_, day) =>
		new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2024, 0, 7 + day, 12))
	);

	return {
		lang: locale,
		calendar: {
			monthFull,
			monthShort,
			dayFull,
			dayShort,
			weekStart: 1,
			clockFormat: 24,
			today: m.today()
		},
		formats: { timeFormat: '%H:%i' },
		eventCalendar: {
			Day: m.day(),
			Week: m.week(),
			Month: m.month(),
			Today: m.today(),
			'Previous period': m.previous(),
			'Next period': m.next(),
			Calendar: m.calendar(),
			timeScaleFormat: '%H:%i',
			weekScaleFormat: '%D',
			monthScaleFormat: '%D',
			weekNumberFormat: isoWeekNumber
		}
	};
}
