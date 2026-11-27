<script lang="ts">
	import { onMount } from 'svelte';
	import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill';
	import zxingWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
	import * as m from '$lib/paraglide/messages';

	let { onscan }: { onscan: (raw: string) => void } = $props();

	let video = $state<HTMLVideoElement>();
	let stream: MediaStream | undefined;
	let detector: BarcodeDetector | undefined;
	let timer: ReturnType<typeof setInterval> | undefined;
	let active = true;
	let error = $state<string | null>(null);

	prepareZXingModule({
		overrides: {
			locateFile: (path: string, prefix: string) =>
				path.endsWith('.wasm') ? zxingWasmUrl : prefix + path
		}
	});

	async function scan(): Promise<void> {
		if (!detector || !active || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
			return;
		try {
			const [barcode] = await detector.detect(video);
			if (!barcode) return;
			onscan(barcode.rawValue);
		} catch {
			// A frame without a decodable QR is normal.
		}
	}

	async function start(): Promise<void> {
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: 'environment' } },
				audio: false
			});
			if (!video) return;
			video.srcObject = stream;
			await video.play();
			error = null;
		} catch {
			error = m.scanner_unavailable();
		}
	}

	onMount(() => {
		void prepareZXingModule({ fireImmediately: true })
			.then(async () => {
				if (!active) return;
				detector = new BarcodeDetector({ formats: ['qr_code'] });
				await start();
				if (active) timer = setInterval(() => void scan(), 300);
			})
			.catch(() => (error = m.scanner_unavailable()));
		return () => {
			active = false;
			if (timer) clearInterval(timer);
			stream?.getTracks().forEach((track) => track.stop());
		};
	});
</script>

<div class="stack">
	{#if error}<p class="error-banner" role="alert">{error}</p>{/if}
	<div class="scanner-frame">
		<video bind:this={video} muted playsinline></video>
		<div class="scanner-target"></div>
	</div>
</div>

<style>
	.scanner-frame {
		position: relative;
		aspect-ratio: 1;
		overflow: hidden;
		border-radius: 1rem;
		background: black;
		max-width: 420px;
	}
	.scanner-frame video {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.scanner-target {
		position: absolute;
		inset: 15%;
		border: 4px solid rgba(255, 255, 255, 0.8);
		border-radius: 1rem;
		pointer-events: none;
	}
</style>
