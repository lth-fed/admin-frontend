export type ToastKind = 'success' | 'error';

export interface Toast {
	id: string;
	kind: ToastKind;
	message: string;
}

class Toasts {
	items = $state<Toast[]>([]);

	show(kind: ToastKind, message: string): void {
		const id = crypto.randomUUID();
		this.items.push({ id, kind, message });
		setTimeout(() => this.dismiss(id), kind === 'error' ? 8_000 : 4_000);
	}

	dismiss(id: string): void {
		this.items = this.items.filter((toast) => toast.id !== id);
	}
}

export const toasts = new Toasts();
