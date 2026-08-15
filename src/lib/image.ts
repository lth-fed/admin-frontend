import { api, responseData } from '$lib/api/client';
import * as m from '$lib/paraglide/messages';
import { toasts } from '$lib/toasts.svelte';

export async function resizeImage(file: File, maxDimension = 1920): Promise<File> {
	const image = await createImageBitmap(file);
	const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
	const width = Math.max(1, Math.round(image.width * scale));
	const height = Math.max(1, Math.round(image.height * scale));
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Image resizing is not supported by this browser');
	context.drawImage(image, 0, 0, width, height);
	image.close();
	const blob = await new Promise<Blob>((resolve, reject) =>
		canvas.toBlob(
			(value) => (value ? resolve(value) : reject(new Error('Could not resize image'))),
			'image/webp',
			0.86
		)
	);
	return new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' });
}

export async function uploadImage(file: File): Promise<string> {
	const upload = file.size < 1_000_000 ? file : await resizeImage(file);
	const extension = upload.name.split('.').pop()?.toLowerCase() ?? '';
	if (!['jpg', 'jpeg', 'png', 'webp', 'avif'].includes(extension))
		throw new Error('Unsupported image format');
	const allowance = responseData(await api.POST('/admin/upload-image', { body: { extension } }));
	if (upload.size > allowance.max_size_bytes) throw new Error('The image is too large');

	const form = new FormData();
	for (const [key, value] of Object.entries(allowance.fields)) form.append(key, value);
	for (const [key, value] of Object.entries(allowance.dynamic_fields)) {
		// A range constrains the policy; it is not an S3 multipart form field.
		if (key.toLowerCase() === 'content-length-range') continue;
		form.append(key, key.toLowerCase() === 'content-type' ? upload.type : value);
	}
	form.set('key', allowance.key);
	form.append('file', upload);
	const result = await fetch(allowance.url, { method: 'POST', body: form });
	if (!result.ok) throw new Error(`Image upload failed (${result.status})`);
	toasts.show('success', m.image_ready());
	return allowance.key.split('.')[0];
}
