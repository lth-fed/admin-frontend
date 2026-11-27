/** Shared expiry presets for anything that can be time limited: sales devices and memberships. */
import { SvelteDate } from 'svelte/reactivity';

export type ExpiryPreset =
	'activity_end' | 'end_of_week' | 'end_of_year' | 'one_month' | 'six_months' | 'custom' | 'never';

export function addMonths(date: Date, months: number): Date {
	const next = new SvelteDate(date);
	next.setMonth(next.getMonth() + months);
	return next;
}

/** Concrete expiry for a preset, as an ISO timestamp. `null` means "never". */
export function untilFor(
	preset: ExpiryPreset,
	options: { customUntil: string; activityEnd?: string | null }
): string | null {
	if (preset === 'never') return null;
	if (preset === 'custom') return options.customUntil;
	if (preset === 'activity_end' && options.activityEnd) return options.activityEnd;
	const now = new SvelteDate();
	if (preset === 'one_month') return addMonths(now, 1).toISOString();
	if (preset === 'six_months') return addMonths(now, 6).toISOString();
	if (preset === 'end_of_week') {
		// Sunday 00:00 local time, the start of the next week.
		const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
		return new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate() + daysUntilSunday
		).toISOString();
	}
	// End of the current calendar year (local time), which is when fiscal cycles reset.
	return new Date(now.getFullYear() + 1, 0, 1).toISOString();
}
