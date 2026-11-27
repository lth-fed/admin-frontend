<script lang="ts">
	import { dateTime } from '$lib/i18n';

	let {
		points,
		label,
		unit = ''
	}: {
		/** Ordered oldest first. */
		points: { time: string; value: number }[];
		label: string;
		unit?: string;
	} = $props();

	const WIDTH = 640;
	const HEIGHT = 200;
	const PAD = { top: 12, right: 12, bottom: 28, left: 44 };

	const geometry = $derived.by(() => {
		if (points.length === 0) return null;
		const xs = points.map((point) => new Date(point.time).getTime());
		const ys = points.map((point) => point.value);
		const minX = Math.min(...xs);
		const maxX = Math.max(...xs);
		const minY = Math.min(...ys, 0);
		const maxY = Math.max(...ys, 1);
		const innerWidth = WIDTH - PAD.left - PAD.right;
		const innerHeight = HEIGHT - PAD.top - PAD.bottom;
		const x = (value: number) =>
			PAD.left + (maxX === minX ? innerWidth / 2 : ((value - minX) / (maxX - minX)) * innerWidth);
		const y = (value: number) =>
			PAD.top + innerHeight - ((value - minY) / (maxY - minY)) * innerHeight;
		const line = points.map((point, index) => `${x(xs[index])},${y(point.value)}`).join(' ');
		const area = `${PAD.left},${PAD.top + innerHeight} ${line} ${PAD.left + innerWidth},${
			PAD.top + innerHeight
		}`;
		return {
			line,
			area,
			minY,
			maxY,
			start: points[0].time,
			end: points[points.length - 1].time,
			last: points[points.length - 1].value
		};
	});
</script>

{#if geometry}
	<figure class="chart">
		<svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label}>
			<line
				class="axis"
				x1={PAD.left}
				x2={WIDTH - PAD.right}
				y1={HEIGHT - PAD.bottom}
				y2={HEIGHT - PAD.bottom} />
			<polygon class="area" points={geometry.area} />
			<polyline class="line" points={geometry.line} />
			<text class="axis-label" x={PAD.left - 8} y={PAD.top + 8} text-anchor="end"
				>{geometry.maxY}{unit}</text>
			<text class="axis-label" x={PAD.left - 8} y={HEIGHT - PAD.bottom} text-anchor="end"
				>{geometry.minY}{unit}</text>
			<text class="axis-label" x={PAD.left} y={HEIGHT - 8}>{dateTime(geometry.start)}</text>
			<text class="axis-label" x={WIDTH - PAD.right} y={HEIGHT - 8} text-anchor="end"
				>{dateTime(geometry.end)}</text>
		</svg>
		<figcaption class="muted">{label}: {geometry.last}{unit}</figcaption>
	</figure>
{/if}

<style>
	.chart {
		margin: 0;
	}
	svg {
		width: 100%;
		height: auto;
	}
	.axis {
		stroke: #303531;
		stroke-width: 1;
	}
	.line {
		fill: none;
		stroke: var(--accent, #7fb98a);
		stroke-width: 2;
	}
	.area {
		fill: color-mix(in srgb, var(--accent, #7fb98a) 18%, transparent);
	}
	.axis-label {
		fill: #969d98;
		font-size: 11px;
	}
</style>
