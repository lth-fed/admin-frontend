<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { rememberActiveGroup } from '$lib/active-group';

	// Stock is shown for one group at a time; old links select the group and land on /stock.
	$effect(() => {
		const groupId = page.params.groupId;
		if (!groupId) return;
		rememberActiveGroup('stock', groupId);
		void goto(resolve('/stock'), { replaceState: true });
	});
</script>

<div class="center-stage">
	<div class="loader"></div>
</div>
