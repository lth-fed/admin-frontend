import * as m from '$lib/paraglide/messages';
import type Cropper from 'cropperjs';

const RATIO = 16 / 9;
type CropBox = { x: number; y: number; width: number; height: number };

/** The crop is applied locally before any image bytes are uploaded. */
export async function cropActivityImage(file: File): Promise<File | null> {
	const { default: Cropper } = await import('cropperjs');
	const url = URL.createObjectURL(file);
	const dialog = document.createElement('dialog');
	dialog.className = 'activity-crop-dialog';
	dialog.setAttribute('aria-label', m.crop_image());
	let cropper: Cropper | undefined;
	let observer: ResizeObserver | undefined;
	try {
		const image = new Image();
		image.src = url;
		await image.decode();
		const heading = document.createElement('h2');
		heading.textContent = m.crop_image();
		const help = document.createElement('p');
		help.id = 'activity-crop-help';
		help.textContent = m.crop_drag_help();
		const stage = document.createElement('div');
		stage.className = 'activity-crop-stage';
		stage.tabIndex = 0;
		stage.setAttribute('role', 'group');
		stage.setAttribute('aria-label', m.crop_image());
		stage.setAttribute('aria-describedby', help.id);
		const actions = document.createElement('div');
		actions.className = 'activity-crop-actions';
		const cancel = document.createElement('button');
		cancel.type = 'button';
		cancel.className = 'button-link secondary';
		cancel.textContent = m.cancel();
		cancel.onclick = () => dialog.close();
		const apply = document.createElement('button');
		apply.type = 'button';
		apply.className = 'button-link';
		apply.textContent = m.crop_apply();
		apply.disabled = true;
		actions.append(cancel, apply);
		dialog.append(heading, help, stage, actions);
		const accepted = new Promise<boolean>((resolve) => {
			apply.onclick = () => resolve(true);
			dialog.addEventListener('close', () => resolve(false), { once: true });
		});
		// Dismiss only when both ends of the click are outside the dialog.
		const outside = (event: MouseEvent): boolean => {
			const rect = dialog.getBoundingClientRect();
			return (
				event.clientX < rect.left ||
				event.clientX > rect.right ||
				event.clientY < rect.top ||
				event.clientY > rect.bottom
			);
		};
		let backdropDown = false;
		let exporting = false;
		dialog.addEventListener('cancel', (event) => {
			if (exporting) event.preventDefault();
		});
		dialog.addEventListener('pointerdown', (event) => {
			backdropDown = outside(event);
		});
		dialog.addEventListener('click', (event) => {
			if (!exporting && backdropDown && outside(event)) dialog.close();
			backdropDown = false;
		});
		document.body.append(dialog);
		dialog.showModal();
		cropper = new Cropper(image, {
			container: stage,
			template: `<cropper-canvas background>
				<cropper-image initial-center-size="contain"></cropper-image>
				<cropper-shade></cropper-shade>
				<cropper-selection aspect-ratio="${RATIO}" movable resizable precise outlined>
					<cropper-grid covered></cropper-grid>
					<cropper-handle action="move" plain></cropper-handle>
					${['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw']
						.map((edge) => `<cropper-handle action="${edge}-resize"></cropper-handle>`)
						.join('')}
				</cropper-selection>
			</cropper-canvas>`
		});
		const canvas = cropper.getCropperCanvas()!;
		const cropImage = cropper.getCropperImage()!;
		const selection = cropper.getCropperSelection()!;
		await cropImage.$ready();
		if (!dialog.open) return null;
		let bounds: CropBox | undefined;
		function fit(): void {
			const previous = bounds;
			const relative = previous
				? {
						x: (selection.x - previous.x) / previous.width,
						y: (selection.y - previous.y) / previous.height,
						width: selection.width / previous.width
					}
				: undefined;
			// Permit programmatic fitting on viewport resize, but keep image gestures disabled.
			cropImage.translatable = true;
			cropImage.scalable = true;
			cropImage.$center('contain');
			cropImage.translatable = false;
			cropImage.scalable = false;
			const area = canvas.getBoundingClientRect();
			const picture = cropImage.getBoundingClientRect();
			bounds = {
				x: picture.left - area.left,
				y: picture.top - area.top,
				width: picture.width,
				height: picture.height
			};
			const width = relative
				? relative.width * bounds.width
				: Math.min(bounds.width, bounds.height * RATIO);
			const height = width / RATIO;
			selection.$change(
				bounds.x + (relative ? relative.x * bounds.width : (bounds.width - width) / 2),
				bounds.y + (relative ? relative.y * bounds.height : (bounds.height - height) / 2),
				width,
				height
			);
		}
		// Keep the crop inside the stationary image, excluding letterboxing.
		selection.addEventListener('change', (event) => {
			if (!bounds) return;
			const box = (event as CustomEvent<CropBox>).detail;
			const tolerance = 0.01;
			if (
				box.width <= 0 ||
				box.height <= 0 ||
				box.x < bounds.x - tolerance ||
				box.y < bounds.y - tolerance ||
				box.x + box.width > bounds.x + bounds.width + tolerance ||
				box.y + box.height > bounds.y + bounds.height + tolerance
			)
				event.preventDefault();
		});
		fit();
		observer = new ResizeObserver(fit);
		observer.observe(stage);
		stage.addEventListener('pointerdown', () => stage.focus({ preventScroll: true }));
		stage.addEventListener('keydown', (event) => {
			if (exporting) return;
			const step = event.shiftKey ? 10 : 1;
			const moves: Record<string, [number, number]> = {
				ArrowLeft: [-step, 0],
				ArrowRight: [step, 0],
				ArrowUp: [0, -step],
				ArrowDown: [0, step]
			};
			if (moves[event.key]) {
				event.preventDefault();
				selection.$move(...moves[event.key]);
			} else if (['+', '=', '-'].includes(event.key)) {
				event.preventDefault();
				const width = selection.width * (event.key === '-' ? 0.9 : 1.1);
				const height = width / RATIO;
				selection.$change(
					selection.x + (selection.width - width) / 2,
					selection.y + (selection.height - height) / 2,
					width,
					height
				);
			}
		});
		apply.disabled = false;
		stage.focus();
		if (!(await accepted)) return null;
		exporting = true;
		observer.disconnect();
		apply.disabled = true;
		cancel.disabled = true;
		canvas.disabled = true;
		const width = Math.max(
			1,
			Math.min(1920, Math.round((selection.width / bounds!.width) * image.naturalWidth))
		);
		const output = await selection.$toCanvas({
			width,
			height: Math.max(1, Math.round(width / RATIO))
		});
		const blob = await new Promise<Blob>((resolve, reject) =>
			output.toBlob(
				(value) => (value ? resolve(value) : reject(new Error(m.crop_failed()))),
				'image/webp',
				0.86
			)
		);
		return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
	} finally {
		observer?.disconnect();
		cropper?.destroy();
		dialog.close();
		dialog.remove();
		URL.revokeObjectURL(url);
	}
}
