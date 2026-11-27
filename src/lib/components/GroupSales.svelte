<script lang="ts">
	import ExportPdf from '$lib/components/ExportPdf.svelte';
	import * as m from '$lib/paraglide/messages';

	let { groupId, activityId = null }: { groupId: string; activityId?: string | null } = $props();
</script>

<section class="card card-pad stack">
	<div>
		<h2 class="section-title">{m.sales()}</h2>
		<p class="muted">{m.sales_export_help()}</p>
	</div>
	<ExportPdf
		kind="sales"
		{groupId}
		{activityId}
		fileName={activityId ? `sales-activity-${activityId}.pdf` : `sales-${groupId}.pdf`} />
</section>
