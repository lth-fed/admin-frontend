<script lang="ts">
	import {
		deleteNews,
		deleteQuestionnaire,
		getMe,
		getNews,
		listGroupTree,
		listNews,
		listNewsTags,
		saveNews,
		saveQuestionnaire
	} from '$lib/api/admin';
	import { frontendError } from '$lib/api/client';
	import type {
		AdminNews,
		AdminNewsSummary,
		AdminNewsTag,
		AdminQuestion,
		AvailableAddon,
		Group,
		PutNews
	} from '$lib/api/types';
	import DateTimePicker from '$lib/components/DateTimePicker.svelte';
	import LocalizedField from '$lib/components/LocalizedField.svelte';
	import { dateTime, localize, sortByLocalizedName } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { toasts } from '$lib/toasts.svelte';
	import { Plus, Trash2 } from '@lucide/svelte';
	import { onMount } from 'svelte';

	type View = 'posts' | 'questionnaires';
	type QuestionOption = AvailableAddon['options'][number];

	let groups = $state<Group[]>([]);
	let adminGroupIds = $state<string[]>([]);
	let selectedGroupId = $state('');
	let view = $state<View>('posts');
	let posts = $state<AdminNewsSummary[]>([]);
	let tags = $state<AdminNewsTag[]>([]);
	let loading = $state(true);
	let saving = $state(false);
	let error = $state<string | null>(null);

	let selectedId = $state<string | null>(null);
	let detail = $state<AdminNews | null>(null);
	let draft = $state<PutNews>(emptyPost());
	let questions = $state<AvailableAddon[]>([]);
	let questionnaireTitle = $state<Record<string, string>>({ sv: '', en: '' });
	let questionnaireOpen = $state(false);

	const availableGroups = $derived(
		sortByLocalizedName(
			groups.filter((group) => adminGroupIds.includes(group.id)),
			(group) => group.name
		)
	);
	const questionnairePosts = $derived(posts.filter((post) => post.has_questionnaire));
	const visiblePosts = $derived(view === 'questionnaires' ? questionnairePosts : posts);

	onMount(async () => {
		try {
			const [me, tree] = await Promise.all([getMe(), listGroupTree()]);
			adminGroupIds = me.admin_group_ids;
			groups = tree;
			selectedGroupId = availableGroups[0]?.id ?? '';
			if (selectedGroupId) {
				await refresh(selectedGroupId);
				// The editor is always visible, so a fresh draft must already belong to the group.
				newPost();
			}
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			loading = false;
		}
	});

	function emptyPost(): PutNews {
		return {
			group_id: '',
			title: { sv: '', en: '' },
			content: { sv: '', en: '' },
			published_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
			tag_ids: []
		};
	}

	function emptyQuestion(): AvailableAddon {
		return {
			id: crypto.randomUUID(),
			name: { sv: '', en: '' },
			multiple_alternatives: false,
			has_text_field: false,
			required: false,
			options: [emptyOption(0)]
		};
	}

	function emptyOption(idx: number): QuestionOption {
		return {
			id: crypto.randomUUID(),
			idx,
			name: { sv: '', en: '' },
			price: 0,
			bookkeeping_prices: [],
			bookkeeping_price_categories: []
		};
	}

	async function refresh(groupId: string): Promise<void> {
		try {
			const [nextPosts, nextTags] = await Promise.all([listNews(groupId), listNewsTags(groupId)]);
			posts = nextPosts;
			tags = nextTags;
			error = null;
		} catch (cause) {
			error = frontendError(cause);
		}
	}

	async function chooseGroup(): Promise<void> {
		selectedId = null;
		detail = null;
		draft = { ...emptyPost(), group_id: selectedGroupId };
		await refresh(selectedGroupId);
	}

	function newPost(): void {
		selectedId = null;
		detail = null;
		draft = { ...emptyPost(), group_id: selectedGroupId };
		questions = [];
		questionnaireTitle = { sv: '', en: '' };
		questionnaireOpen = false;
	}

	async function openPost(id: string): Promise<void> {
		error = null;
		try {
			const news = await getNews(id);
			detail = news;
			draft = {
				group_id: news.group_id,
				title: { ...news.title },
				content: { ...news.content },
				published_at: news.published_at,
				tag_ids: news.tags.map((tag) => tag.id)
			};
			questions = news.questionnaire?.questions.map((question) => toAddon(question)) ?? [];
			questionnaireTitle = news.questionnaire?.title ?? { sv: '', en: '' };
			questionnaireOpen = news.questionnaire !== undefined && news.questionnaire !== null;
			selectedId = id;
			await refresh(selectedGroupId);
		} catch (cause) {
			error = frontendError(cause);
		}
	}

	function toAddon(question: AdminQuestion): AvailableAddon {
		return {
			id: question.id,
			name: { ...question.name },
			multiple_alternatives: question.multiple_alternatives,
			has_text_field: question.has_text_field,
			required: question.required,
			options: question.options.map((option, index) => ({
				id: option.id,
				idx: index,
				name: { ...option.name },
				price: 0,
				bookkeeping_prices: [],
				bookkeeping_price_categories: []
			}))
		};
	}

	function toggleTag(tagId: string, checked: boolean): void {
		draft = {
			...draft,
			tag_ids: checked ? [...draft.tag_ids, tagId] : draft.tag_ids.filter((id) => id !== tagId)
		};
	}

	function addQuestion(): void {
		questions = [...questions, emptyQuestion()];
	}

	function removeQuestion(id: string): void {
		questions = questions.filter((question) => question.id !== id);
	}

	function updateQuestion(id: string, change: Partial<AvailableAddon>): void {
		questions = questions.map((question) =>
			question.id === id ? { ...question, ...change } : question
		);
	}

	function addOption(questionId: string): void {
		questions = questions.map((question) =>
			question.id === questionId
				? { ...question, options: [...question.options, emptyOption(question.options.length)] }
				: question
		);
	}

	function removeOption(questionId: string, optionId: string): void {
		questions = questions.map((question) =>
			question.id === questionId
				? { ...question, options: question.options.filter((option) => option.id !== optionId) }
				: question
		);
	}

	function updateOption(
		questionId: string,
		optionId: string,
		change: Partial<QuestionOption>
	): void {
		questions = questions.map((question) =>
			question.id === questionId
				? {
						...question,
						options: question.options.map((option) =>
							option.id === optionId ? { ...option, ...change } : option
						)
					}
				: question
		);
	}

	function cleanQuestions(): AvailableAddon[] {
		return questions.map((question) => ({
			...question,
			options: question.options.map((option, index) => ({
				...option,
				idx: index,
				price: 0,
				bookkeeping_prices: [],
				bookkeeping_price_categories: []
			}))
		}));
	}

	async function save(): Promise<void> {
		if (!draft.group_id || saving) return;
		if (!draft.content.sv?.trim() || !draft.content.en?.trim()) {
			error = m.required_fields();
			return;
		}
		saving = true;
		error = null;
		try {
			const id = selectedId ?? crypto.randomUUID();
			await saveNews(id, draft);
			selectedId = id;
			if (questionnaireOpen) {
				await saveQuestionnaire(id, {
					title: questionnaireTitle.en?.trim()
						? questionnaireTitle
						: { ...questionnaireTitle, en: draft.title.en || draft.title.sv || '' },
					questions: cleanQuestions()
				});
			}
			selectedId = id;
			await openPost(id);
			toasts.show('success', m.backend_success());
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			saving = false;
		}
	}

	async function removePost(): Promise<void> {
		if (!selectedId || !confirm(m.news_delete_confirm())) return;
		try {
			await deleteNews(selectedId);
			selectedId = null;
			detail = null;
			newPost();
			await refresh(selectedGroupId);
			toasts.show('success', m.backend_success());
		} catch (cause) {
			error = frontendError(cause);
		}
	}

	async function removeQuestionnaire(): Promise<void> {
		if (saving) return;
		if (!detail?.questionnaire || !selectedId) {
			questionnaireOpen = false;
			questions = [];
			return;
		}
		saving = true;
		error = null;
		try {
			await deleteQuestionnaire(selectedId);
			questionnaireOpen = false;
			questions = [];
			detail = { ...detail, questionnaire: undefined };
			await refresh(selectedGroupId);
			toasts.show('success', m.backend_success());
		} catch (cause) {
			error = frontendError(cause);
		} finally {
			saving = false;
		}
	}

	function questionStats(question: AvailableAddon): AdminQuestion | undefined {
		return detail?.questionnaire?.questions.find((entry) => entry.id === question.id);
	}
</script>

<svelte:head><title>{m.news()} · {m.app_name()}</title></svelte:head>

<header class="page-header">
	<div>
		<p class="eyebrow">{m.news()}</p>
		<h1>{m.news()}</h1>
		<p class="muted">{m.news_description()}</p>
	</div>
</header>

{#if loading}
	<div class="center-stage">
		<div class="loader"></div>
		<p>{m.loading()}</p>
	</div>
{:else if availableGroups.length === 0}
	<p class="empty-state">{m.no_admin_groups()}</p>
{:else}
	<div class="stack">
		{#if error}<p class="error-banner" role="alert">{error}</p>{/if}
		<label class="field">
			<span>{m.group()}</span>
			<select bind:value={selectedGroupId} onchange={() => void chooseGroup()}>
				{#each availableGroups as group (group.id)}
					<option value={group.id}>{localize(group.name, group.path)}</option>
				{/each}
			</select>
		</label>

		<div class="toolbar">
			<button
				class="button-link"
				class:secondary={view !== 'posts'}
				type="button"
				onclick={() => (view = 'posts')}>{m.news_posts()}</button>
			<button
				class="button-link"
				class:secondary={view !== 'questionnaires'}
				type="button"
				onclick={() => (view = 'questionnaires')}>{m.news_questionnaires()}</button>
			<span class="spacer"></span>
			<button class="button-link secondary" type="button" onclick={newPost}>
				<Plus size={17} />
				{m.new_news_post()}
			</button>
		</div>

		<div class="grid">
			<section class="card card-pad stack">
				{#if visiblePosts.length === 0}
					<p class="empty-state">{m.news_no_posts()}</p>
				{:else}
					<ul class="list">
						{#each visiblePosts as post (post.id)}
							<li>
								<div class="list-main">
									<strong>{localize(post.title, '')}</strong>
									<span
										>{dateTime(post.published_at)} · {post.sent ? m.sent() : m.not_sent()}
										{#if post.has_questionnaire}
											· {m.news_answer_count({ count: post.responses })}
										{/if}
									</span>
									<span>{localize(post.content)}</span>
								</div>
								<button
									class="button-link secondary"
									type="button"
									onclick={() => void openPost(post.id)}>{m.open()}</button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section class="card card-pad stack">
				<div class="toolbar between">
					<h2 class="section-title">
						{selectedId ? localize(draft.title, '') || m.edit_notification() : m.new_news_post()}
					</h2>
					{#if selectedId}
						<button
							class="icon-button danger-button"
							type="button"
							aria-label={m.delete()}
							onclick={() => void removePost()}><Trash2 size={16} /></button>
					{/if}
				</div>
				{#if detail?.sent}
					<p class="warning-banner" role="note">{m.news_sent_warning()}</p>
				{/if}
				<div class="grid-2">
					<LocalizedField
						value={draft.title}
						labelSv={m.notification_title_sv()}
						labelEn={m.notification_title_en()}
						onchange={(title) => (draft = { ...draft, title })} />
					<DateTimePicker
						label={m.news_published_at()}
						value={draft.published_at}
						onchange={(published_at) => (draft = { ...draft, published_at })} />
				</div>
				<LocalizedField
					value={draft.content}
					labelSv={m.notification_content_sv()}
					labelEn={m.notification_content_en()}
					multiline
					required
					onchange={(content) => (draft = { ...draft, content })} />

				<h3 class="section-title">{m.news_tags()}</h3>
				{#if tags.length === 0}
					<p class="muted">{m.news_no_tags()}</p>
				{:else}
					<div class="stack">
						{#each tags as tag (tag.id)}
							<label class="switch-field">
								<input
									type="checkbox"
									checked={draft.tag_ids.includes(tag.id)}
									onchange={(event) => toggleTag(tag.id, event.currentTarget.checked)} />
								<span
									>{localize(tag.title, '')} <span class="muted">({tag.creator_path})</span></span>
							</label>
						{/each}
					</div>
				{/if}

				<div class="toolbar between">
					<h3 class="section-title">{m.news_questionnaire()}</h3>
					{#if questionnaireOpen}
						<button
							class="button-link secondary"
							type="button"
							disabled={saving}
							onclick={() => void removeQuestionnaire()}>{m.news_remove_questionnaire()}</button>
					{:else}
						<button
							class="button-link secondary"
							type="button"
							onclick={() => (questionnaireOpen = true)}>{m.news_add_questionnaire()}</button>
					{/if}
				</div>

				{#if questionnaireOpen}
					<p class="muted">{m.news_questionnaire_hint()}</p>
					<LocalizedField
						value={questionnaireTitle}
						labelSv={m.news_questionnaire_title()}
						labelEn={m.news_questionnaire_title()}
						onchange={(title) => (questionnaireTitle = title)} />

					{#each questions as question, questionIndex (question.id)}
						{@const stats = questionStats(question)}
						<div class="nested-card stack">
							<div class="toolbar between">
								<h4 class="section-title">{m.news_question()} {questionIndex + 1}</h4>
								<button
									class="icon-button danger-button"
									type="button"
									aria-label={m.delete()}
									onclick={() => removeQuestion(question.id)}><Trash2 size={16} /></button>
							</div>
							<LocalizedField
								value={question.name}
								labelSv={m.name_sv()}
								labelEn={m.name_en()}
								onchange={(name) => updateQuestion(question.id, { name })} />
							<div class="toolbar">
								<label class="switch-field">
									<input
										type="checkbox"
										checked={question.required}
										onchange={(event) =>
											updateQuestion(question.id, {
												required: event.currentTarget.checked
											})} />
									<span>{m.required()}</span>
								</label>
								<label class="switch-field">
									<input
										type="checkbox"
										checked={question.multiple_alternatives}
										onchange={(event) =>
											updateQuestion(question.id, {
												multiple_alternatives: event.currentTarget.checked
											})} />
									<span>{m.multiple_alternatives()}</span>
								</label>
								<label class="switch-field">
									<input
										type="checkbox"
										checked={question.has_text_field}
										onchange={(event) =>
											updateQuestion(question.id, {
												has_text_field: event.currentTarget.checked
											})} />
									<span>{m.news_text_responses()}</span>
								</label>
							</div>

							{#each question.options as option, optionIndex (option.id)}
								<div class="toolbar">
									<span class="muted">{m.news_option()} {optionIndex + 1}</span>
									<div class="grow">
										<LocalizedField
											value={option.name}
											labelSv={m.name_sv()}
											labelEn={m.name_en()}
											onchange={(name) => updateOption(question.id, option.id, { name })} />
									</div>
									<button
										class="icon-button danger-button"
										type="button"
										aria-label={m.delete()}
										onclick={() => removeOption(question.id, option.id)}
										><Trash2 size={15} /></button>
								</div>
							{/each}
							<button
								class="button-link secondary"
								type="button"
								onclick={() => addOption(question.id)}>{m.news_add_option()}</button>

							{#if stats}
								<div class="stack">
									<strong>{m.news_answer_count({ count: stats.responses })}</strong>
									{#if stats.responses === 0}
										<p class="muted">{m.news_no_responses()}</p>
									{:else}
										<ul class="list">
											{#each stats.options as optionStats (optionStats.id)}
												<li>
													<div class="list-main">
														<span>{localize(optionStats.name, '')}</span>
														<span class="muted"
															>{m.news_responses({ count: optionStats.responses })}</span>
													</div>
												</li>
											{/each}
										</ul>
										{#if stats.text_responses.length > 0}
											<strong>{m.news_text_responses()}</strong>
											<ul class="list">
												{#each stats.text_responses as answer, index (index)}
													<li><div class="list-main"><span>{answer}</span></div></li>
												{/each}
											</ul>
										{/if}
									{/if}
								</div>
							{/if}
						</div>
					{/each}

					<button class="button-link secondary" type="button" onclick={addQuestion}>
						<Plus size={16} />
						{m.news_add_question()}
					</button>
				{/if}

				<div class="toolbar">
					<button
						class="button-link"
						type="button"
						disabled={saving || !draft.group_id}
						onclick={() => void save()}>
						{saving ? m.saving() : m.save_notification()}
					</button>
					<button class="button-link secondary" type="button" disabled={saving} onclick={newPost}
						>{m.cancel()}</button>
				</div>
			</section>
		</div>
	</div>
{/if}
