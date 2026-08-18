export type CoordinateAxis = 'north' | 'east';

/** Parse decimal degrees or degrees/minutes/seconds with a compass suffix. */
export function parseCoordinate(value: string, axis: CoordinateAxis): number | undefined | null {
	const input = value.trim();
	if (!input) return undefined;

	if (/^[+-]?\d+(?:[.,]\d+)?$/.test(input)) {
		const decimal = Number(input.replace(',', '.'));
		return inRange(decimal, axis) ? decimal : null;
	}

	const match = input.match(
		/^(\d{1,3})\s*°\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:[.,]\d+)?)\s*["″]?\s*([NSEW])$/i
	);
	if (!match) return null;

	const [, degreesText, minutesText, secondsText, directionText] = match;
	const degrees = Number(degreesText);
	const minutes = Number(minutesText);
	const seconds = Number(secondsText.replace(',', '.'));
	const direction = directionText.toUpperCase();
	if (minutes >= 60 || seconds >= 60) return null;
	if (axis === 'north' && direction !== 'N' && direction !== 'S') return null;
	if (axis === 'east' && direction !== 'E' && direction !== 'W') return null;

	const sign = direction === 'S' || direction === 'W' ? -1 : 1;
	const decimal = sign * (degrees + minutes / 60 + seconds / 3600);
	return inRange(decimal, axis) ? decimal : null;
}

function inRange(value: number, axis: CoordinateAxis): boolean {
	return Number.isFinite(value) && Math.abs(value) <= (axis === 'north' ? 90 : 180);
}
