/** Saves a blob as a file via a temporary object URL. */
export function saveBlob(blob: Blob, fileName: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = fileName;
	document.body.append(link);
	link.click();
	link.remove();
	// Revoke later: some browsers still read the URL after `click()` returns.
	window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
