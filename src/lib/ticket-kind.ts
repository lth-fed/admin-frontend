import type { PutTicketKind, TicketKind } from '$lib/api/types';

/** Keep server-only fields out of ticket edits and copies. */
export function ticketKindBody(kind: TicketKind): PutTicketKind {
	return {
		activity_id: kind.activity_id,
		name: kind.ticket_kind_name,
		price: kind.price,
		purchasing_available_start: kind.purchasing_available_start,
		purchasing_available_stop: kind.purchasing_available_stop,
		max_tickets: kind.max_tickets,
		for_visibility: kind.for_visibility,
		min_tickets: kind.min_tickets,
		allow_transfer_ticket_start: kind.allow_transfer_ticket_start,
		allow_transfer_ticket_stop: kind.allow_transfer_ticket_stop,
		transfer_group_ids: kind.transfer_group_ids,
		allowed_group_ids: kind.allowed_group_ids,
		addons: kind.available_addons
	};
}
