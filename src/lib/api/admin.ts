import * as m from '$lib/paraglide/messages';
import { api, mutationData, responseData } from './client';
import type {
	Activity,
	AdminUser,
	ActivityHostInvite,
	ActivityTicketKind,
	BriefActivity,
	Group,
	GroupNotification,
	Me,
	PurchasedTicket,
	PutActivity,
	PutGroup,
	PutNotification,
	PutTicketKind,
	ReportRequest,
	TicketKind,
	TicketNotification
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

export async function listActivities(start: Date, end: Date): Promise<BriefActivity[]> {
	return responseData(
		await api.GET('/activities', {
			params: { query: { paging_start: start.toISOString(), paging_end: end.toISOString() } }
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

export async function listActivityVerifiers(activityId: string): Promise<string[]> {
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

export async function saveTicketKind(id: string, body: PutTicketKind): Promise<void> {
	mutation(await api.PUT('/admin/ticket-kinds/{id}', { params: { path: { id } }, body }));
}

export async function deleteTicketKind(id: string): Promise<void> {
	mutation(await api.DELETE('/admin/ticket-kinds/{id}', { params: { path: { id } } }));
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

export async function listNotifications(ticketKindId: string): Promise<TicketNotification[]> {
	return responseData(
		await api.GET('/admin/ticket-kinds/{ticket_kind_id}/notifications', {
			params: { path: { ticket_kind_id: ticketKindId } }
		})
	);
}

export async function saveNotification(
	ticketKindId: string,
	kind: string,
	body: PutNotification
): Promise<TicketNotification> {
	return mutation(
		await api.PUT('/admin/ticket-kinds/{ticket_kind_id}/notifications/{kind}', {
			params: { path: { ticket_kind_id: ticketKindId, kind } },
			body
		})
	);
}

export async function deleteNotification(ticketKindId: string, kind: string): Promise<void> {
	mutation(
		await api.DELETE('/admin/ticket-kinds/{ticket_kind_id}/notifications/{kind}', {
			params: { path: { ticket_kind_id: ticketKindId, kind } }
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

export async function listGroupUsers(): Promise<AdminUser[]> {
	return responseData(await api.GET('/admin/group-users'));
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
