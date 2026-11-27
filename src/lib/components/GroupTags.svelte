<script lang="ts">
	import { frontendError } from '$lib/api/client';
	import { listGroupTags, saveTag, setTagHidden, type TagKind } from '$lib/api/admin';
	import type { AdminTag } from '$lib/api/types';
	import { localize, type Localized } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { toasts } from '$lib/toasts.svelte';
	import LocalizedField from '$lib/components/LocalizedField.svelte';

	let { groupId }: { groupId: string } = $props();

	const kinds: { kind: TagKind; label: () => string }[] = [
		{ kind: 'activity', label: m.group_tags_activity },
		{ kind: 'news', label: m.group_tags_news },
		{ kind: 'product', label: m.group_tags_product }
	];

	let tags = $state<Record<TagKind, AdminTag[]>>({ activity: [], news: [], product: [] });
	let drafts = $state<Record<TagKind, { id: string; title: Localized }>>({
		activity: { id: '', title: { sv: '', en: '' } },
		news: { id: '', title: { sv: '', en: '' } },
		product: { id: '', title: { sv: '', en: '' } }
	});
	let error = $state<string | null>(null);
	let busy = $state(false);

	$effect(() => {
		const id = groupId;
		void load(id);
	});

	async function load(id: string): Promise<void> {
		try {
			const [activity, news, product] = await Promise.all([
				listGroupTags(id, 'activity'),
				listGroupTags(id, 'news'),
				listGroupTags(id, 'product')
			]);
			tags = { activity, news, product };
			error = null;
		} catch (cause) {
			error = frontendError(cause);
		}
	}

	async function add(kind: TagKind): Promise<void> {
		const draft = drafts[kind];
		if (!draft.title.sv.trim() || !draft.title.en.trim()) return;
		busy = true;
		try {
			await saveTag(kind, crypto.randomUUID(), { creator_id: groupId, title: draft.title });
			drafts[kind] = { id: '', title: { sv: '', en: '' } };
			await load(groupId);
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			busy = false;
		}
	}

	async function toggleHidden(kind: TagKind, tag: AdminTag): Promise<void> {
		busy = true;
		try {
			await setTagHidden(kind, tag.id, !tag.hidden);
			toasts.show('success', m.backend_success());
			await load(groupId);
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			busy = false;
		}
	}
</script>

<section class="card card-pad stack">
	<h2 class="section-title">{m.group_tags()}</h2>
	<p class="muted">{m.group_tags_help()}</p>
	{#if error}<p class="error-banner" role="alert">{error}</p>{/if}
	{#each kinds as { kind, label } (kind)}
		<div class="stack">
			<h3 class="section-title">{label()}</h3>
			{#if tags[kind].length === 0}
				<p class="muted">{m.group_tags_empty()}</p>
			{:else}
				<ul class="stack">
					{#each tags[kind] as tag (tag.id)}
						<li class="row">
							<span>{localize(tag.title, '')}</span>
							{#if tag.hidden}<small class="muted">{m.group_tags_hidden()}</small>{/if}
							<button
								class="button-link"
								type="button"
								disabled={busy}
								onclick={() => void toggleHidden(kind, tag)}>
								{tag.hidden ? m.group_tags_show() : m.group_tags_hide()}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
			<LocalizedField
				value={drafts[kind].title}
				labelSv={m.name_sv()}
				labelEn={m.name_en()}
				onchange={(title) => (drafts[kind] = { ...drafts[kind], title })} />
			<div>
				<button class="button-link" type="button" disabled={busy} onclick={() => void add(kind)}>
					{m.group_tags_add()}
				</button>
			</div>
		</div>
	{/each}
</section>
