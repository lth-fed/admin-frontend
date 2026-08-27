import type { AdminUser, PurchasedTicket, TicketKind } from '$lib/api/types';
import { localize } from '$lib/i18n';
import * as m from '$lib/paraglide/messages';
import { getLocale } from '$lib/paraglide/runtime';

function csvCell(value: string): string {
	return `"${value.replaceAll('"', '""')}"`;
}

function purchaseAmount(ticket: PurchasedTicket, kind: TicketKind | undefined): number {
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

function sek(valueInOre: number): string {
	return `${new Intl.NumberFormat(getLocale(), {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	}).format(valueInOre / 100)} SEK`;
}

export function downloadTicketPurchasersCsv(
	purchases: PurchasedTicket[],
	kinds: TicketKind[],
	users: AdminUser[]
): void {
	const usersById = new Map(users.map((user) => [user.user_id, user.name]));
	const kindsById = new Map(kinds.map((kind) => [kind.ticket_kind_id, kind]));
	const csv = [
		[
			m.csv_purchaser_name(),
			m.csv_purchaser_id(),
			m.csv_owner_name(),
			m.csv_owner_id(),
			m.csv_ticket_kind(),
			m.csv_amount()
		]
			.map(csvCell)
			.join(','),
		...purchases.map((ticket) => {
			const kind = kindsById.get(ticket.ticket_kind_id);
			return [
				usersById.get(ticket.purchaser_id) ?? '',
				ticket.purchaser_id,
				usersById.get(ticket.owner_id) ?? '',
				ticket.owner_id,
				kind ? localize(kind.ticket_kind_name) : '',
				sek(purchaseAmount(ticket, kind))
			]
				.map(csvCell)
				.join(',');
		})
	].join('\r\n');
	const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = 'ticket-purchasers.csv';
	document.body.append(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}
