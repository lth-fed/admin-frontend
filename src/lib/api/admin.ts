import * as m from '$lib/paraglide/messages';
import { hasDietaryPreferencesAddon } from '$lib/ticket-presets';
import {
	defaultTransferGroupUpdates,
	defaultTransferGroups,
	hasDefaultTransferGroups,
	sameGroups
} from '$lib/transfer-settings';
import { toasts } from '$lib/toasts.svelte';
import { api, mutationData, responseData } from './client';
import type {
	Activity,
	ActivityNotification,
	AdminUser,
	ActivityHostInvite,
	ActivityTicketKind,
	BriefActivity,
	Group,
	GroupNotification,
	Me,
	PurchasedTicket,
	PutActivity,
	PutActivityNotification,
	PutGroup,
	PutNotification,
	PutTicketKind,
	ReportRequest,
	TicketKind
} from './types';

function mutation<T>(response: { data?: T; error?: unknown; response: Response }): T {
	return mutationData(response, m.backend_success());
}

export async function getMe(): Promise<Me> {
	return responseData(await api.GET('/user'));
}

export async function saveLanguage(language: string): Promise<void> {
	responseData(await api.PUT('/user/language', { body: language }));
}

export async function getPersonalAccount(): Promise<string | null> {
	return responseData(await api.GET('/admin/personal-account')) ?? null;
}

export async function savePersonalAccount(account: string): Promise<void> {
	mutation(await api.PUT('/admin/personal-account', { body: account }));
}

export async function unlinkPersonalAccount(): Promise<void> {
	mutation(await api.DELETE('/admin/personal-account'));
}

export async function listActivities(start?: Date, end?: Date): Promise<BriefActivity[]> {
	if (!start && !end) return responseData(await api.GET('/activities'));
	return responseData(
		await api.GET('/activities', {
			params: {
				query: {
					paging_start: start?.toISOString(),
					paging_end: end?.toISOString()
				}
			}
		})
	);
}

export async function getActivity(id: string): Promise<Activity> {
	return responseData(await api.GET('/activities/{id}', { params: { path: { id } } }));
}

export async function saveActivity(id: string, body: PutActivity): Promise<void> {
	mutation(await api.PUT('/admin/activities/{id}', { params: { path: { id } }, body }));
}

export async function deleteActivity(id: string): Promise<void> {
	mutation(await api.DELETE('/admin/activities/{id}', { params: { path: { id } } }));
}

export async function listActivityHostInvites(): Promise<ActivityHostInvite[]> {
	return responseData(await api.GET('/admin/activity-host-invites'));
}

export async function listPendingActivityHosts(activityId: string): Promise<Group[]> {
	return responseData(
		await api.GET('/admin/activities/{activity_id}/host-invites', {
			params: { path: { activity_id: activityId } }
		})
	);
}

export async function inviteActivityHost(activityId: string, groupId: string): Promise<void> {
	mutation(
		await api.PUT('/admin/activities/{activity_id}/host-invites/{group_id}', {
			params: { path: { activity_id: activityId, group_id: groupId } }
		})
	);
}

export async function acceptActivityHostInvite(activityId: string, groupId: string): Promise<void> {
	mutation(
		await api.POST('/admin/activity-host-invites/{activity_id}/{group_id}/accept', {
			params: { path: { activity_id: activityId, group_id: groupId } }
		})
	);
}

export async function declineActivityHostInvite(
	activityId: string,
	groupId: string
): Promise<void> {
	mutation(
		await api.DELETE('/admin/activity-host-invites/{activity_id}/{group_id}', {
			params: { path: { activity_id: activityId, group_id: groupId } }
		})
	);
}

export async function listActivityVerifiers(activityId: string): Promise<AdminUser[]> {
	return responseData(
		await api.GET('/admin/activities/{activity_id}/verifiers', {
			params: { path: { activity_id: activityId } }
		})
	);
}

export async function getVerifiedTicketHolderCount(activityId: string): Promise<number> {
	return responseData(
		await api.GET('/admin/activities/{activity_id}/verified-ticket-holders', {
			params: { path: { activity_id: activityId } }
		})
	);
}

export async function addActivityVerifier(activityId: string, verifierId: string): Promise<void> {
	mutation(
		await api.PUT('/admin/activities/{activity_id}/verifiers/{verifier_id}', {
			params: { path: { activity_id: activityId, verifier_id: verifierId } }
		})
	);
}

export async function removeActivityVerifier(
	activityId: string,
	verifierId: string
): Promise<void> {
	mutation(
		await api.DELETE('/admin/activities/{activity_id}/verifiers/{verifier_id}', {
			params: { path: { activity_id: activityId, verifier_id: verifierId } }
		})
	);
}

export async function downloadActivityReport(id: string, body: ReportRequest): Promise<Blob> {
	return responseData(
		await api.POST('/admin/activities/{id}/report', {
			params: { path: { id } },
			body,
			parseAs: 'blob',
			headers: { Accept: 'application/octet-stream' }
		})
	);
}

export async function listActivityTicketKinds(id: string): Promise<ActivityTicketKind[]> {
	return responseData(await api.GET('/activities/{id}/ticket-kinds', { params: { path: { id } } }));
}

export async function getTicketKind(id: string): Promise<TicketKind> {
	return responseData(await api.GET('/tickets/ticket-kind/{id}', { params: { path: { id } } }));
}

export async function saveTicketKind(id: string, body: PutTicketKind): Promise<PutTicketKind> {
	const before = await activityTicketKinds(body.activity_id);
	const dietary = body.addons.find((addon) => hasDietaryPreferencesAddon([addon]));
	if (dietary) {
		const existing = (await listActivityAddons(body.activity_id)).find((addon) =>
			hasDietaryPreferencesAddon([addon])
		);
		if (!existing) await saveActivityAddon(body.activity_id, dietary);
		body = {
			...body,
			addons: [
				...body.addons.filter((addon) => !hasDietaryPreferencesAddon([addon])),
				existing ?? dietary
			]
		};
	}
	const existing = before.find((kind) => kind.ticket_kind_id === id);
	const after = [...before.filter((kind) => kind.ticket_kind_id !== id), body];
	if (
		existing &&
		hasDefaultTransferGroups(existing, before) &&
		sameGroups(body.transfer_group_ids, existing.transfer_group_ids)
	) {
		body = { ...body, transfer_group_ids: defaultTransferGroups(body, after) };
		after[after.length - 1] = body;
	}
	const transferGroupUpdates = defaultTransferGroupUpdates(before, after, id);
	await putTicketKind(id, body);
	await applyDefaultTransferGroupUpdates(before, transferGroupUpdates);
	toasts.show('success', m.backend_success());
	return body;
}

async function activityTicketKinds(activityId: string): Promise<TicketKind[]> {
	return Promise.all(
		(await listActivityTicketKinds(activityId)).map((kind) => getTicketKind(kind.id))
	);
}

async function applyDefaultTransferGroupUpdates(
	ticketKinds: TicketKind[],
	updates: Map<string, string[]>
): Promise<void> {
	for (const [ticketKindId, transfer_group_ids] of updates) {
		const kind = ticketKinds.find((candidate) => candidate.ticket_kind_id === ticketKindId);
		if (!kind) continue;
		await putTicketKind(kind.ticket_kind_id, {
			...kind,
			name: kind.ticket_kind_name,
			addons: kind.available_addons,
			transfer_group_ids
		});
	}
}

async function putTicketKind(id: string, body: PutTicketKind): Promise<void> {
	const { addons, ...fields } = body;
	responseData(
		await api.PUT('/admin/ticket-kinds/{id}', {
			params: { path: { id } },
			body: { ...fields, addon_ids: addons.map((addon) => addon.id) }
		})
	);
}

export async function listActivityAddons(activity_id: string): Promise<PutTicketKind['addons']> {
	return responseData(
		await api.GET('/admin/activities/{activity_id}/addons', { params: { path: { activity_id } } })
	);
}

export async function saveActivityAddon(
	activity_id: string,
	addon: PutTicketKind['addons'][number]
): Promise<void> {
	responseData(
		await api.PUT('/admin/activities/{activity_id}/addons', {
			params: { path: { activity_id } },
			body: addon
		})
	);
}

export async function deleteActivityAddon(activity_id: string, addon_id: string): Promise<void> {
	responseData(
		await api.DELETE('/admin/activities/{activity_id}/addons/{addon_id}', {
			params: { path: { activity_id, addon_id } }
		})
	);
}

export async function deleteTicketKind(id: string): Promise<void> {
	const ticket = await getTicketKind(id);
	const before = await activityTicketKinds(ticket.activity_id);
	const after = before.filter((kind) => kind.ticket_kind_id !== id);
	const transferGroupUpdates = defaultTransferGroupUpdates(before, after, id);
	responseData(await api.DELETE('/admin/ticket-kinds/{id}', { params: { path: { id } } }));
	await applyDefaultTransferGroupUpdates(before, transferGroupUpdates);
	toasts.show('success', m.backend_success());
}

export async function listPurchasedTickets(id: string): Promise<PurchasedTicket[]> {
	return responseData(
		await api.GET('/admin/ticket-kinds/{id}/purchased-tickets', {
			params: { path: { id } }
		})
	);
}

export async function listAddonNames(): Promise<PutTicketKind['name'][]> {
	return responseData(await api.GET('/admin/addon-names'));
}

export async function listActivityNotifications(
	activityId: string
): Promise<ActivityNotification[]> {
	return responseData(
		await api.GET('/admin/activities/{activity_id}/notifications', {
			params: { path: { activity_id: activityId } }
		})
	);
}

export async function saveActivityNotification(
	activityId: string,
	id: string,
	body: PutActivityNotification
): Promise<ActivityNotification> {
	return mutation(
		await api.PUT('/admin/activities/{activity_id}/notifications/{id}', {
			params: { path: { activity_id: activityId, id } },
			body
		})
	);
}

export async function deleteActivityNotification(activityId: string, id: string): Promise<void> {
	mutation(
		await api.DELETE('/admin/activities/{activity_id}/notifications/{id}', {
			params: { path: { activity_id: activityId, id } }
		})
	);
}

export async function listGroupTree(): Promise<Group[]> {
	return responseData(await api.GET('/groups/tree'));
}

export async function saveGroup(id: string, body: PutGroup): Promise<void> {
	mutation(await api.PUT('/admin/groups/{id}', { params: { path: { id } }, body }));
}

export async function deleteGroup(groupId: string): Promise<void> {
	mutation(
		await api.DELETE('/admin/groups/{group_id}', { params: { path: { group_id: groupId } } })
	);
}

export async function listGroupNotifications(groupId: string): Promise<GroupNotification[]> {
	return responseData(
		await api.GET('/admin/groups/{group_id}/notifications', {
			params: { path: { group_id: groupId } }
		})
	);
}

export async function saveGroupNotification(
	groupId: string,
	id: string,
	body: PutNotification
): Promise<GroupNotification> {
	return mutation(
		await api.PUT('/admin/groups/{group_id}/notifications/{id}', {
			params: { path: { group_id: groupId, id } },
			body
		})
	);
}

export async function deleteGroupNotification(groupId: string, id: string): Promise<void> {
	mutation(
		await api.DELETE('/admin/groups/{group_id}/notifications/{id}', {
			params: { path: { group_id: groupId, id } }
		})
	);
}

export async function listMemberRequests(groupId: string): Promise<AdminUser[]> {
	return responseData(
		await api.GET('/admin/groups/{group_id}/member-requests', {
			params: { path: { group_id: groupId } }
		})
	);
}

export async function approveMemberRequest(groupId: string, memberId: string): Promise<void> {
	mutation(
		await api.PUT('/admin/groups/{group_id}/member-requests/{member_id}', {
			params: { path: { group_id: groupId, member_id: memberId } }
		})
	);
}

export async function denyMemberRequest(groupId: string, memberId: string): Promise<void> {
	mutation(
		await api.DELETE('/admin/groups/{group_id}/member-requests/{member_id}', {
			params: { path: { group_id: groupId, member_id: memberId } }
		})
	);
}

export async function listMembers(groupId: string): Promise<AdminUser[]> {
	return responseData(
		await api.GET('/admin/groups/{group_id}/members', {
			params: { path: { group_id: groupId } }
		})
	);
}

export async function addMember(groupId: string, memberId: string): Promise<void> {
	mutation(
		await api.PUT('/admin/groups/{group_id}/members/{member_id}', {
			params: { path: { group_id: groupId, member_id: memberId } }
		})
	);
}

export async function removeMember(groupId: string, memberId: string): Promise<void> {
	mutation(
		await api.DELETE('/admin/groups/{group_id}/members/{member_id}', {
			params: { path: { group_id: groupId, member_id: memberId } }
		})
	);
}

export async function listAdmins(groupId: string): Promise<AdminUser[]> {
	return responseData(
		await api.GET('/admin/groups/{group_id}/admins', {
			params: { path: { group_id: groupId } }
		})
	);
}

export async function listVisibleMembers(): Promise<AdminUser[]> {
	return responseData(await api.GET('/admin/groups/visible-members'));
}

export async function addAdmin(groupId: string, userId: string): Promise<void> {
	mutation(
		await api.POST('/admin/groups/{group_id}/admins', {
			params: { path: { group_id: groupId } },
			body: { user_id: userId }
		})
	);
}

export async function removeAdmin(groupId: string, userId: string): Promise<void> {
	mutation(
		await api.DELETE('/admin/groups/{group_id}/admins/{user_id}', {
			params: { path: { group_id: groupId, user_id: userId } }
		})
	);
}

type GroupRelation = 'joiner-groups' | 'activity-admin-groups';

export async function listGroupRelations(
	groupId: string,
	relation: GroupRelation
): Promise<Group[]> {
	return relation === 'joiner-groups'
		? responseData(
				await api.GET('/admin/groups/{group_id}/joiner-groups', {
					params: { path: { group_id: groupId } }
				})
			)
		: responseData(
				await api.GET('/admin/groups/{group_id}/activity-admin-groups', {
					params: { path: { group_id: groupId } }
				})
			);
}

export async function addGroupRelation(
	groupId: string,
	relation: GroupRelation,
	relatedId: string
): Promise<void> {
	if (relation === 'joiner-groups') {
		mutation(
			await api.PUT('/admin/groups/{group_id}/joiner-groups', {
				params: { path: { group_id: groupId } },
				body: { group_id: relatedId }
			})
		);
	} else {
		mutation(
			await api.PUT('/admin/groups/{group_id}/activity-admin-groups', {
				params: { path: { group_id: groupId } },
				body: { group_id: relatedId }
			})
		);
	}
}

export async function removeGroupRelation(
	groupId: string,
	relation: GroupRelation,
	relatedId: string
): Promise<void> {
	if (relation === 'joiner-groups') {
		mutation(
			await api.DELETE('/admin/groups/{group_id}/joiner-groups/{joiner_id}', {
				params: { path: { group_id: groupId, joiner_id: relatedId } }
			})
		);
	} else {
		mutation(
			await api.DELETE('/admin/groups/{group_id}/activity-admin-groups/{access_group_id}', {
				params: { path: { group_id: groupId, access_group_id: relatedId } }
			})
		);
	}
}
