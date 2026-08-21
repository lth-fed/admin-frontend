<script lang="ts">
	import type { AdminUser, Group, PurchasedTicket, TicketKind } from '$lib/api/types';
	import { kronor, localize } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { Grid, WillowDark } from '@svar-ui/svelte-grid';
	import type { IColumnConfig, IRow } from '@svar-ui/svelte-grid';
	import { SvelteMap } from 'svelte/reactivity';

	let {
		purchases,
		kinds,
		groups = [],
		users = [],
		view = 'buyers'
	}: {
		purchases: PurchasedTicket[];
		kinds: TicketKind[];
		groups?: Group[];
		users?: AdminUser[];
		view?: 'buyers' | 'breakdown' | 'memberships';
	} = $props();

	const usersById = $derived(new Map(users.map((user) => [user.user_id, user.name])));
	const kindsById = $derived(new Map(kinds.map((kind) => [kind.ticket_kind_id, kind])));
	const columns = $derived<IColumnConfig[]>(
		view === 'memberships'
			? [
					{ id: 'item', header: m.memberships(), treetoggle: true, flexgrow: 2, width: 230 },
					{ id: 'type', header: m.purchase_type(), flexgrow: 1, width: 130 },
					{ id: 'count', header: m.members(), width: 100 }
				]
			: [
					{ id: 'item', header: m.purchase_item(), treetoggle: true, flexgrow: 2, width: 230 },
					{ id: 'type', header: m.purchase_type(), flexgrow: 1, width: 130 },
					{ id: 'count', header: m.purchase_count(), width: 100 },
					{ id: 'total', header: m.purchase_total(), width: 130 }
				]
	);

	function normalizedName(name: { sv?: string; en?: string }): string {
		return (name.sv || name.en || '')
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLocaleLowerCase('sv')
			.replace(/[^a-z0-9]/g, '');
	}

	function userLabel(id: string): string {
		const name = usersById.get(id);
		return name ? `${name} · ${id}` : id;
	}

	function purchasePrice(ticket: PurchasedTicket): number {
		const kind = kindsById.get(ticket.ticket_kind_id);
		if (!kind) return 0;
		return (
			kind.price +
			ticket.addons.reduce((sum, answer) => {
				const addon = kind.available_addons.find((item) => item.id === answer.addon_id);
				return (
					sum +
					(addon?.options
						.filter((option) => answer.selected_options.includes(option.idx))
						.reduce((optionSum, option) => optionSum + option.price, 0) ?? 0)
				);
			}, 0)
		);
	}

	function ticketChildren(ticket: PurchasedTicket, kind: TicketKind): IRow[] {
		return ticket.addons.flatMap((answer) => {
			const addon = kind.available_addons.find((item) => item.id === answer.addon_id);
			if (!addon) return [];
			const selected = addon.options.filter((option) =>
				answer.selected_options.includes(option.idx)
			);
			const rows: IRow[] = selected.map((option) => ({
				id: `${ticket.id}:option:${addon.id}:${option.idx}`,
				item: `${localize(addon.name)}: ${localize(option.name)}`,
				type: m.addon_option(),
				count: 1,
				total: kronor(option.price)
			}));
			if (answer.selected_text.trim()) {
				rows.push({
					id: `${ticket.id}:text:${addon.id}`,
					item: `${localize(addon.name)}: ${answer.selected_text.trim()}`,
					type: m.text_response(),
					count: 1,
					total: kronor(0)
				});
			}
			return rows;
		});
	}

	function buildBuyerRows(): IRow[] {
		const byOwner = new SvelteMap<string, PurchasedTicket[]>();
		for (const ticket of purchases) {
			byOwner.set(ticket.owner_id, [...(byOwner.get(ticket.owner_id) ?? []), ticket]);
		}
		return [...byOwner.entries()]
			.sort(([left], [right]) => userLabel(left).localeCompare(userLabel(right)))
			.map(([ownerId, tickets]) => ({
				id: `buyer:${ownerId}`,
				item: userLabel(ownerId),
				type: m.buyer(),
				count: tickets.length,
				total: kronor(tickets.reduce((sum, ticket) => sum + purchasePrice(ticket), 0)),
				open: false,
				data: tickets.flatMap((ticket) => {
					const kind = kindsById.get(ticket.ticket_kind_id);
					if (!kind) return [];
					return [
						{
							id: `ticket:${ticket.id}`,
							item: localize(kind.ticket_kind_name),
							type: m.base_ticket(),
							count: 1,
							total: kronor(purchasePrice(ticket)),
							open: false,
							data: ticketChildren(ticket, kind)
						}
					];
				})
			}));
	}

	type Breakdown = { id: string; item: string; type: string; buyers: IRow[]; total: number };

	function buildBreakdownRows(): IRow[] {
		const baseKinds = new SvelteMap<string, Breakdown>();
		const addons = new SvelteMap<string, Breakdown & { options: SvelteMap<string, Breakdown> }>();

		for (const ticket of purchases) {
			const kind = kindsById.get(ticket.ticket_kind_id);
			if (!kind) continue;
			const base = baseKinds.get(kind.ticket_kind_id) ?? {
				id: `base:${kind.ticket_kind_id}`,
				item: localize(kind.ticket_kind_name),
				type: m.base_ticket(),
				buyers: [],
				total: 0
			};
			base.total += kind.price;
			base.buyers.push({
				id: `${base.id}:buyer:${ticket.id}`,
				item: userLabel(ticket.owner_id),
				type: m.buyer(),
				count: 1,
				total: kronor(kind.price)
			});
			baseKinds.set(kind.ticket_kind_id, base);

			for (const answer of ticket.addons) {
				const addon = kind.available_addons.find((item) => item.id === answer.addon_id);
				if (!addon) continue;
				const addonKey = normalizedName(addon.name);
				const addonRow = addons.get(addonKey) ?? {
					id: `addon:${addonKey}`,
					item: localize(addon.name),
					type: m.addons(),
					buyers: [],
					total: 0,
					options: new SvelteMap<string, Breakdown>()
				};
				for (const option of addon.options.filter((item) =>
					answer.selected_options.includes(item.idx)
				)) {
					const optionKey = normalizedName(option.name);
					const optionRow = addonRow.options.get(optionKey) ?? {
						id: `${addonRow.id}:option:${optionKey}`,
						item: localize(option.name),
						type: m.addon_option(),
						buyers: [],
						total: 0
					};
					optionRow.total += option.price;
					optionRow.buyers.push({
						id: `${optionRow.id}:buyer:${ticket.id}`,
						item: userLabel(ticket.owner_id),
						type: m.buyer(),
						count: 1,
						total: kronor(option.price)
					});
					addonRow.options.set(optionKey, optionRow);
					addonRow.total += option.price;
				}
				if (answer.selected_text.trim()) {
					const optionKey = '$text';
					const textRow = addonRow.options.get(optionKey) ?? {
						id: `${addonRow.id}:text`,
						item: m.text_answers(),
						type: m.text_response(),
						buyers: [],
						total: 0
					};
					textRow.buyers.push({
						id: `${textRow.id}:buyer:${ticket.id}`,
						item: `${userLabel(ticket.owner_id)}: ${answer.selected_text.trim()}`,
						type: m.text_response(),
						count: 1,
						total: kronor(0)
					});
					addonRow.options.set(optionKey, textRow);
				}
				addons.set(addonKey, addonRow);
			}
		}

		const baseChildren = [...baseKinds.values()].map((row) => ({
			...row,
			count: row.buyers.length,
			total: kronor(row.total),
			open: false,
			data: row.buyers
		}));
		const baseTotal = [...baseKinds.values()].reduce((sum, row) => sum + row.total, 0);
		const rows: IRow[] = baseChildren.length
			? [
					{
						id: 'base-tickets',
						item: m.base_tickets(),
						type: m.base_ticket(),
						count: purchases.length,
						total: kronor(baseTotal),
						open: false,
						data: baseChildren
					}
				]
			: [];
		for (const addon of [...addons.values()].sort((a, b) => a.item.localeCompare(b.item))) {
			const options = [...addon.options.values()].map((option) => ({
				...option,
				count: option.buyers.length,
				total: kronor(option.total),
				open: false,
				data: option.buyers
			}));
			rows.push({
				id: addon.id,
				item: addon.item,
				type: addon.type,
				count: options.reduce((sum, option) => sum + option.count, 0),
				total: kronor(addon.total),
				open: false,
				data: options
			});
		}
		return rows;
	}

	function buildMembershipRows(): IRow[] {
		const groupsById = new Map(groups.map((group) => [group.id, group]));
		const ownersByGroupId = new SvelteMap<string, SvelteMap<string, true>>();
		for (const purchase of purchases) {
			for (const groupId of new Set(purchase.owner_memberships)) {
				if (!groupsById.has(groupId)) continue;
				const owners = ownersByGroupId.get(groupId) ?? new SvelteMap<string, true>();
				owners.set(purchase.owner_id, true);
				ownersByGroupId.set(groupId, owners);
			}
		}

		return [...ownersByGroupId.entries()]
			.sort(([leftId], [rightId]) => {
				const left = groupsById.get(leftId)!;
				const right = groupsById.get(rightId)!;
				return localize(left.name, left.path).localeCompare(localize(right.name, right.path));
			})
			.map(([groupId, owners]) => {
				const group = groupsById.get(groupId)!;
				return {
					id: `membership:${group.id}`,
					item: localize(group.name, group.path),
					type: m.membership(),
					count: owners.size,
					open: false,
					data: [...owners.keys()]
						.sort((left, right) => userLabel(left).localeCompare(userLabel(right)))
						.map((ownerId) => ({
							id: `membership:${group.id}:owner:${ownerId}`,
							item: userLabel(ownerId),
							type: m.buyer(),
							count: 1
						}))
				};
			});
	}

	const rows = $derived.by(() => {
		if (view === 'buyers') return buildBuyerRows();
		if (view === 'breakdown') return buildBreakdownRows();
		return buildMembershipRows();
	});
</script>

{#if rows.length === 0}
	<p class="empty-state">{m.empty()}</p>
{:else}
	<div class="purchase-grid">
		<WillowDark>
			<Grid data={rows} {columns} tree autoRowHeight select={false} />
		</WillowDark>
	</div>
{/if}
