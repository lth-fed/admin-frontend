// Password managers ignore `autocomplete="off"` on their own, so also set the
// vendor-specific opt-out attributes on every input inside the node.
const ATTRIBUTES: Record<string, string> = {
	autocomplete: 'off',
	'data-1p-ignore': 'true',
	'data-lpignore': 'true',
	'data-bwignore': 'true',
	'data-form-type': 'other'
};

function apply(node: HTMLElement): void {
	for (const input of node.querySelectorAll('input')) {
		for (const [name, value] of Object.entries(ATTRIBUTES)) input.setAttribute(name, value);
	}
}

/** Svelte action that stops password managers from offering to fill a field. */
export function noAutofill(node: HTMLElement): { destroy: () => void } {
	apply(node);
	// The wrapped component may render its input after the action runs.
	const observer = new MutationObserver(() => apply(node));
	observer.observe(node, { childList: true, subtree: true });
	return { destroy: () => observer.disconnect() };
}
