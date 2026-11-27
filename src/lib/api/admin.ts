import * as m from '$lib/paraglide/messages';
import { toasts } from '$lib/toasts.svelte';
import { api, authenticatedFetch, mutationData, responseData } from './client';
import { apiBaseUrl } from '$lib/config';
import type { components } from '$lib/api/generated/minilith';
import type {
	Activity,
	ActivityNotification,
	AdminPurchaseHistoryStep,
	AdminPurchaseRow,
	SoldProduct,
	AdminResale,
	AdminUser,
	ActivityHostInvite,
	AdminNews,
	AdminNewsSummary,
	AdminNewsTag,
	AdminProduct,
	AdminProductTag,
	AdminTag,
	AdminMember,
	PutAdminTag,
	TicketBuyer,
	AdminSalesTarget,
	AvailableAddon,
	BriefActivity,
	CreatedUser,
	Group,
	GroupNotification,
	Me,
	PhysicalSalesClient,
	PurchasedTicket,
	PutActivity,
	PutActivityNotification,
	PutGroup,
	PutNews,
	PutNotification,
	PutProduct,
	PutQuestionnaire,
	ReportRequest,
	AdminVoteMeeting,
	VoteMeeting,
	VoteMeetingAdmin,
	PutStockTransaction,
	StockLine,
	StockPoint,
	StockTransaction
} from './types';

function mutation<T>(response: { data?: T; error?: unknown; response: Response }): T {
	return mutationData(response, m.backend_success());
}

export async function getMe(): Promise<Me> {
	return responseData(await api.GET('/v0/user'));
}

export async function saveLanguage(language: string): Promise<void> {
	responseData(await api.PUT('/v0/user/language', { body: language }));
}

export async function getPersonalAccount(): Promise<string | null> {
	return responseData(await api.GET('/v0/admin/personal-account')) ?? null;
}

export async function savePersonalAccount(account: string): Promise<void> {
	mutation(await api.PUT('/v0/admin/personal-account', { body: account }));
}

export async function unlinkPersonalAccount(): Promise<void> {
	mutation(await api.DELETE('/v0/admin/personal-account'));
}

export async function listActivities(start?: Date, end?: Date): Promise<BriefActivity[]> {
	if (!start && !end) return responseData(await api.GET('/v0/activities'));
	return responseData(
		await api.GET('/v0/activities', {
			params: {
				query: {
					paging_start: start?.toISOString(),
					paging_end: end?.toISOString()
				}
			}
		})
	);
}

export async function linkActivityItem(activityId: string, productId: string): Promise<void> {
	mutation(
		await api.PUT('/v0/admin/activities/{activity_id}/products/{product_id}', {
			params: { path: { activity_id: activityId, product_id: productId } }
		})
	);
}

export async function unlinkActivityItem(activityId: string, productId: string): Promise<void> {
	mutation(
		await api.DELETE('/v0/admin/activities/{activity_id}/products/{product_id}', {
			params: { path: { activity_id: activityId, product_id: productId } }
		})
	);
}

export async function getActivity(id: string): Promise<Activity> {
	return responseData(await api.GET('/v0/activities/{id}', { params: { path: { id } } }));
}

export async function saveActivity(id: string, body: PutActivity): Promise<void> {
	mutation(await api.PUT('/v0/admin/activities/{id}', { params: { path: { id } }, body }));
}

export async function deleteActivity(id: string): Promise<void> {
	mutation(await api.DELETE('/v0/admin/activities/{id}', { params: { path: { id } } }));
}

export async function listActivityHostInvites(): Promise<ActivityHostInvite[]> {
	return responseData(await api.GET('/v0/admin/activity-host-invites'));
}

export async function listPendingActivityHosts(activityId: string): Promise<Group[]> {
	return responseData(
		await api.GET('/v0/admin/activities/{activity_id}/host-invites', {
			params: { path: { activity_id: activityId } }
		})
	);
}

export async function inviteActivityHost(activityId: string, groupId: string): Promise<void> {
	mutation(
		await api.PUT('/v0/admin/activities/{activity_id}/host-invites/{group_id}', {
			params: { path: { activity_id: activityId, group_id: groupId } }
		})
	);
}

export async function acceptActivityHostInvite(activityId: string, groupId: string): Promise<void> {
	mutation(
		await api.POST('/v0/admin/activity-host-invites/{activity_id}/{group_id}/accept', {
			params: { path: { activity_id: activityId, group_id: groupId } }
		})
	);
}

export async function declineActivityHostInvite(
	activityId: string,
	groupId: string
): Promise<void> {
	mutation(
		await api.DELETE('/v0/admin/activity-host-invites/{activity_id}/{group_id}', {
			params: { path: { activity_id: activityId, group_id: groupId } }
		})
	);
}

export async function listActivityVerifiers(activityId: string): Promise<AdminUser[]> {
	return responseData(
		await api.GET('/v0/admin/activities/{activity_id}/verifiers', {
			params: { path: { activity_id: activityId } }
		})
	);
}

export async function getVerifiedTicketHolderCount(activityId: string): Promise<number> {
	return responseData(
		await api.GET('/v0/admin/activities/{activity_id}/verified-ticket-holders', {
			params: { path: { activity_id: activityId } }
		})
	);
}

export async function listTicketBuyers(
	activityId: string,
	productId: string
): Promise<TicketBuyer[]> {
	return responseData(
		await api.GET('/v0/admin/activities/{activity_id}/products/{product_id}/buyers', {
			params: { path: { activity_id: activityId, product_id: productId } }
		})
	);
}

export async function inviteTicketBuyer(
	activityId: string,
	productId: string,
	buyerId: string
): Promise<void> {
	mutation(
		await api.PUT('/v0/admin/activities/{activity_id}/products/{product_id}/buyers/{buyer_id}', {
			params: { path: { activity_id: activityId, product_id: productId, buyer_id: buyerId } }
		})
	);
}

export async function removeTicketBuyer(
	activityId: string,
	productId: string,
	buyerId: string
): Promise<void> {
	mutation(
		await api.DELETE('/v0/admin/activities/{activity_id}/products/{product_id}/buyers/{buyer_id}', {
			params: { path: { activity_id: activityId, product_id: productId, buyer_id: buyerId } }
		})
	);
}

export async function addActivityVerifier(activityId: string, verifierId: string): Promise<void> {
	mutation(
		await api.PUT('/v0/admin/activities/{activity_id}/verifiers/{verifier_id}', {
			params: { path: { activity_id: activityId, verifier_id: verifierId } }
		})
	);
}

export async function removeActivityVerifier(
	activityId: string,
	verifierId: string
): Promise<void> {
	mutation(
		await api.DELETE('/v0/admin/activities/{activity_id}/verifiers/{verifier_id}', {
			params: { path: { activity_id: activityId, verifier_id: verifierId } }
		})
	);
}

export async function downloadActivityReport(id: string, body: ReportRequest): Promise<Blob> {
	return responseData(
		await api.POST('/v0/admin/activities/{id}/report', {
			params: { path: { id } },
			body,
			parseAs: 'blob',
			headers: { Accept: 'application/octet-stream' }
		})
	);
}

export async function listActivityProducts(activityId: string): Promise<AdminProduct[]> {
	return responseData(
		await api.GET('/v0/admin/activities/{activity_id}/products', {
			params: { path: { activity_id: activityId } }
		})
	);
}

export async function listGroupProducts(groupId: string): Promise<AdminProduct[]> {
	return responseData(
		await api.GET('/v0/admin/groups/{group_id}/products', {
			params: { path: { group_id: groupId } }
		})
	);
}

export async function getProduct(id: string): Promise<AdminProduct> {
	return responseData(await api.GET('/v0/admin/products/{id}', { params: { path: { id } } }));
}

export async function saveProduct(
	id: string,
	body: PutProduct,
	{ notify = true } = {}
): Promise<PutProduct> {
	const { addons, ...fields } = body;
	responseData(
		await api.PUT('/v0/admin/products/{id}', {
			params: { path: { id } },
			// The bookkeeping split is sent as `bookkeeping_tag_ids`; the generated types lag behind
			// until `pnpm api:generate` runs again.
			body: {
				...fields,
				addon_ids: addons.map((addon) => addon.id)
			} as unknown as components['schemas']['PutProduct']
		})
	);
	if (notify) toasts.show('success', m.backend_success());
	return body;
}

export async function deleteProduct(id: string): Promise<void> {
	responseData(await api.DELETE('/v0/admin/products/{id}', { params: { path: { id } } }));
	toasts.show('success', m.backend_success());
}

export async function listSalesTargets(): Promise<AdminSalesTarget[]> {
	return responseData(await api.GET('/v0/admin/sales-targets'));
}

export async function listProductTags(): Promise<AdminProductTag[]> {
	return responseData(await api.GET('/v0/admin/product-tags'));
}

export async function createExternalUser(body: {
	name: string;
	group_ids: string[];
}): Promise<CreatedUser> {
	return responseData(await api.POST('/v0/admin/external-users', { body }));
}

export async function listVoteMeetings(groupId?: string): Promise<VoteMeeting[]> {
	return responseData(
		await api.GET('/v0/admin/vote-meetings', {
			params: { query: { group_id: groupId } }
		})
	);
}

// The generated client is refreshed after the backend is restarted.
export async function deleteVoteMeeting(id: string): Promise<void> {
	const response = await authenticatedFetch(
		new Request(`${apiBaseUrl}/v0/admin/vote-meetings/${encodeURIComponent(id)}`, {
			method: 'DELETE'
		})
	);
	const error = response.ok ? undefined : await response.json().catch(() => undefined);
	responseData({ response, error });
}

export async function getVoteMeeting(id: string): Promise<AdminVoteMeeting> {
	return responseData(
		await api.GET('/v0/admin/vote-meetings/{id}', {
			params: { path: { id } }
		})
	);
}

export async function createVoteMeeting(body: {
	group_id: string;
	activity_id?: string;
	secure_voting: boolean;
	title: Record<string, string>;
}): Promise<string> {
	return responseData(await api.POST('/v0/admin/vote-meetings', { body }));
}

export async function createVoteRound(
	meetingId: string,
	body: {
		title: Record<string, string>;
		max_choices: number;
		alternatives: Record<string, string>[];
	}
): Promise<string> {
	return responseData(
		await api.POST('/v0/admin/vote-meetings/{id}/rounds', {
			params: { path: { id: meetingId } },
			body
		})
	);
}

export async function setVoteRoundOpen(
	meetingId: string,
	body: { round_id: string; open: boolean }
): Promise<void> {
	mutation(
		await api.PUT('/v0/admin/vote-meetings/{id}/rounds', {
			params: { path: { id: meetingId } },
			body
		})
	);
}

export async function listVoteMeetingAdmins(meetingId: string): Promise<VoteMeetingAdmin[]> {
	return responseData(
		await api.GET('/v0/admin/vote-meetings/{id}/admins', {
			params: { path: { id: meetingId } }
		})
	);
}

export async function putVoteMeetingAdmin(
	meetingId: string,
	body: { user_id: string; readonly: boolean }
): Promise<void> {
	mutation(
		await api.PUT('/v0/admin/vote-meetings/{id}/admins', {
			params: { path: { id: meetingId } },
			body
		})
	);
}

export async function deleteVoteMeetingAdmin(meetingId: string, userId: string): Promise<void> {
	mutation(
		await api.DELETE('/v0/admin/vote-meetings/{id}/admins/{user_id}', {
			params: { path: { id: meetingId, user_id: userId } }
		})
	);
}

/**
 * Registers a voting device. The scanned QR payload is JSON:
 * `{"cid": "<random uuid>", "t": <now, server-time adjusted, ms or ISO>, "uid": "<logged in user id>"}`.
 * `cid` becomes `client_id`; `uid` is required for secure meetings (one vote per person).
 * The app polls `GET /v1/vote-meetings/{id}` every 5 s for the current round and live counts, and
 * casts votes with `PUT /v1/vote-meetings/{id}/votes`.
 */
export async function registerVoteClient(
	meetingId: string,
	body: { client_id: string; user_id?: string }
): Promise<void> {
	mutation(
		await api.POST('/v0/admin/vote-meetings/{id}/clients', {
			params: { path: { id: meetingId } },
			body
		})
	);
}

export async function getStockHistory(groupId: string, productId: string): Promise<StockPoint[]> {
	return responseData(
		await api.GET('/v0/admin/groups/{group_id}/stock-history', {
			params: { path: { group_id: groupId }, query: { product_id: productId } }
		})
	);
}

export async function listStock(groupId: string): Promise<StockLine[]> {
	return responseData(
		await api.GET('/v0/admin/groups/{group_id}/stock', {
			params: { path: { group_id: groupId } }
		})
	);
}

export async function listStockTransactions(groupId: string): Promise<StockTransaction[]> {
	return responseData(
		await api.GET('/v0/admin/groups/{group_id}/stock-transactions', {
			params: { path: { group_id: groupId } }
		})
	);
}

export async function setStockTracking(groupId: string, enabled: boolean): Promise<void> {
	mutation(
		await api.PUT('/v0/admin/groups/{group_id}/stock-tracking', {
			params: { path: { group_id: groupId } },
			body: { enabled }
		})
	);
}

export async function updateStockTransaction(id: string, body: PutStockTransaction): Promise<void> {
	mutation(
		await api.PUT('/v0/admin/stock-transactions/{id}', {
			params: { path: { id } },
			body
		})
	);
}

export async function replenishStockSalesStock(movementId: string): Promise<number> {
	const { data, error } = await api.POST(
		'/v0/admin/stock-transactions/{id}/replenish-sales-stock',
		{
			params: { path: { id: movementId } }
		}
	);
	if (error) throw error;
	return data ?? 0;
}

/** Books every tracked product down to zero and returns the reset movement, if one was needed. */
export async function startStockInventory(groupId: string): Promise<string | null> {
	const { data, error } = await api.POST(
		'/v0/admin/groups/{group_id}/stock-transactions/inventory-reset',
		{ params: { path: { group_id: groupId } } }
	);
	if (error) throw error;
	return data ?? null;
}

export async function createStockTransaction(
	groupId: string,
	body: PutStockTransaction
): Promise<void> {
	mutation(
		await api.POST('/v0/admin/groups/{group_id}/stock-transactions', {
			params: { path: { group_id: groupId } },
			body
		})
	);
}

export type PurchaseScope = {
	groupId?: string;
	activityId?: string;
	start?: string;
	end?: string;
};

function purchaseQuery(scope: PurchaseScope): {
	group_id?: string;
	activity_id?: string;
	start?: string;
	end?: string;
} {
	return {
		group_id: scope.groupId,
		activity_id: scope.activityId,
		start: scope.start,
		end: scope.end
	};
}

export async function listPurchases(scope: PurchaseScope): Promise<AdminPurchaseRow[]> {
	return responseData(
		await api.GET('/v0/admin/purchases', { params: { query: purchaseQuery(scope) } })
	);
}

export async function listSoldProducts(scope: PurchaseScope): Promise<SoldProduct[]> {
	return responseData(
		await api.GET('/v0/admin/purchases/sold', { params: { query: purchaseQuery(scope) } })
	);
}

/** Who owned a purchase and when: purchases, transfers and the refunds of each payment. */
export async function listPurchaseHistory(purchaseId: string): Promise<AdminPurchaseHistoryStep[]> {
	return responseData(
		await api.GET('/v0/admin/purchases/{id}/history', {
			params: { path: { id: purchaseId } }
		})
	);
}

export async function downloadPurchaseReceipt(purchaseId: string): Promise<Blob> {
	return responseData(
		await api.GET('/v0/admin/purchases/{id}/receipt', {
			params: { path: { id: purchaseId } },
			parseAs: 'blob',
			headers: { Accept: 'application/octet-stream' }
		})
	) as unknown as Blob;
}

export async function emailPurchaseReceipt(purchaseId: string, email: string): Promise<void> {
	mutation(
		await api.POST('/v0/admin/purchases/{id}/receipt', {
			params: { path: { id: purchaseId } },
			body: { email }
		})
	);
}

export async function downloadGroupSales(
	groupId: string,
	options: { start?: string; end?: string; activityId?: string; productId?: string }
): Promise<Blob> {
	return responseData(
		await api.GET('/v0/admin/groups/{group_id}/sales.pdf', {
			params: {
				path: { group_id: groupId },
				query: {
					start: options.start,
					end: options.end,
					activity_id: options.activityId,
					product_id: options.productId
				}
			},
			parseAs: 'blob',
			headers: { Accept: 'application/pdf' }
		})
	) as unknown as Blob;
}

export async function downloadStock(
	groupId: string,
	options: { start?: string; end?: string; transactionId?: string }
): Promise<Blob> {
	return responseData(
		await api.GET('/v0/admin/groups/{group_id}/stock.pdf', {
			params: {
				path: { group_id: groupId },
				query: {
					start: options.start,
					end: options.end,
					transaction_id: options.transactionId
				}
			},
			parseAs: 'blob',
			headers: { Accept: 'application/pdf' }
		})
	) as unknown as Blob;
}

export async function listActivityReaders(activityId: string): Promise<GroupReader[]> {
	return responseData(
		await api.GET('/v1/readers', {
			params: { query: { activity_id: activityId } }
		})
	);
}

export type ReaderDevice = { identifier: string; model: string };
export type GroupReader = {
	id: string;
	name: string;
	group_id: string;
	group_path: string;
	group_name: Record<string, string>;
	status: string;
	device?: ReaderDevice | null;
};

export async function listGroupReaders(groupId: string): Promise<GroupReader[]> {
	return responseData(
		await api.GET('/v0/admin/groups/{group_id}/readers', {
			params: { path: { group_id: groupId } }
		})
	);
}

export async function pairGroupReader(
	groupId: string,
	body: { pairing_code: string; name: string }
): Promise<GroupReader> {
	return responseData(
		await api.POST('/v0/admin/groups/{group_id}/readers', {
			params: { path: { group_id: groupId } },
			body
		})
	) as unknown as GroupReader;
}

export async function updateGroupReader(
	id: string,
	body: { name?: string; group_id?: string }
): Promise<GroupReader> {
	return responseData(
		await api.PATCH('/v0/admin/readers/{id}', {
			params: { path: { id } },
			body
		})
	) as unknown as GroupReader;
}

export async function deleteGroupReader(id: string): Promise<void> {
	mutation(await api.DELETE('/v0/admin/readers/{id}', { params: { path: { id } } }));
}

export async function listGroupResales(groupId: string): Promise<AdminResale[]> {
	return responseData(
		await api.GET('/v0/admin/groups/{group_id}/resales', {
			params: { path: { group_id: groupId } }
		})
	);
}

export async function listPhysicalSalesClients(
	target: { group_id: string } | { activity_id: string }
): Promise<PhysicalSalesClient[]> {
	return responseData(
		await api.GET('/v0/admin/physical-sales-clients', { params: { query: target } })
	);
}

export async function createPhysicalSalesClient(body: {
	id: string;
	name: string;
	until: string;
	group_id?: string;
	activity_id?: string;
}): Promise<void> {
	mutation(await api.POST('/v0/admin/physical-sales-clients', { body }));
}

export async function deletePhysicalSalesClient(id: string): Promise<void> {
	mutation(await api.DELETE('/v0/admin/physical-sales-clients/{id}', { params: { path: { id } } }));
}

export type CreateApiKeyBody = { id: string; email?: string; group_ids: string[] };
export type CreatedApiKey = { user_id: string; api_key: string };

export async function createApiKey(body: CreateApiKeyBody): Promise<CreatedApiKey> {
	return responseData(await api.POST('/v0/admin/api-keys', { body }));
}

/** Add-ons belong to an activity's or to a product's add-on set; pass exactly one id. */
export type AddonOwner = { activityId?: string | null; productId?: string | null };

function addonOwnerQuery(owner: AddonOwner): { activity_id?: string; product_id?: string } {
	return {
		activity_id: owner.activityId ?? undefined,
		product_id: owner.productId ?? undefined
	};
}

export async function listAddons(owner: AddonOwner): Promise<AvailableAddon[]> {
	return responseData(
		await api.GET('/v0/admin/addons', { params: { query: addonOwnerQuery(owner) } })
	);
}

export async function saveAddon(owner: AddonOwner, addon: AvailableAddon): Promise<void> {
	responseData(
		await api.PUT('/v0/admin/addons', { params: { query: addonOwnerQuery(owner) }, body: addon })
	);
}

export async function deleteAddon(addon_id: string): Promise<void> {
	responseData(await api.DELETE('/v0/admin/addons/{addon_id}', { params: { path: { addon_id } } }));
}

export async function listPurchasedTickets(id: string): Promise<PurchasedTicket[]> {
	return responseData(
		await api.GET('/v0/admin/products/{id}/purchases', {
			params: { path: { id } }
		})
	);
}

export async function refundPurchase(id: string, message?: string): Promise<void> {
	mutation(
		await api.POST('/v0/admin/purchases/{id}/refund', {
			params: { path: { id } },
			body: { message: message?.trim() || null }
		})
	);
}

export async function listActivityNotifications(
	activityId: string
): Promise<ActivityNotification[]> {
	return responseData(
		await api.GET('/v0/admin/activities/{activity_id}/push_notifications', {
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
		await api.PUT('/v0/admin/activities/{activity_id}/push_notifications/{id}', {
			params: { path: { activity_id: activityId, id } },
			body
		})
	);
}

export async function deleteActivityNotification(activityId: string, id: string): Promise<void> {
	mutation(
		await api.DELETE('/v0/admin/activities/{activity_id}/push_notifications/{id}', {
			params: { path: { activity_id: activityId, id } }
		})
	);
}

export async function listGroupTree(): Promise<Group[]> {
	return responseData(await api.GET('/v0/groups/tree'));
}

export async function saveGroup(id: string, body: PutGroup): Promise<void> {
	mutation(await api.PUT('/v0/admin/groups/{id}', { params: { path: { id } }, body }));
}

export async function deleteGroup(groupId: string): Promise<void> {
	mutation(
		await api.DELETE('/v0/admin/groups/{group_id}', { params: { path: { group_id: groupId } } })
	);
}

export async function listGroupNotifications(groupId: string): Promise<GroupNotification[]> {
	return responseData(
		await api.GET('/v0/admin/groups/{group_id}/push_notifications', {
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
		await api.PUT('/v0/admin/groups/{group_id}/push_notifications/{id}', {
			params: { path: { group_id: groupId, id } },
			body
		})
	);
}

export async function deleteGroupNotification(groupId: string, id: string): Promise<void> {
	mutation(
		await api.DELETE('/v0/admin/groups/{group_id}/push_notifications/{id}', {
			params: { path: { group_id: groupId, id } }
		})
	);
}

export async function listNews(groupId: string): Promise<AdminNewsSummary[]> {
	return responseData(
		await api.GET('/v0/admin/news', { params: { query: { group_id: groupId } } })
	);
}

export async function getNews(id: string): Promise<AdminNews> {
	return responseData(await api.GET('/v0/admin/news/{id}', { params: { path: { id } } }));
}

export async function saveNews(id: string, body: PutNews): Promise<AdminNews> {
	return responseData(await api.PUT('/v0/admin/news/{id}', { params: { path: { id } }, body }));
}

export async function deleteNews(id: string): Promise<void> {
	mutation(await api.DELETE('/v0/admin/news/{id}', { params: { path: { id } } }));
}

export async function listNewsTags(groupId: string): Promise<AdminNewsTag[]> {
	return responseData(
		await api.GET('/v0/admin/news-tags', { params: { query: { group_id: groupId } } })
	);
}

export type TagKind = 'activity' | 'news' | 'product';

export async function listGroupTags(groupId: string, kind: TagKind): Promise<AdminTag[]> {
	return responseData(
		await api.GET('/v0/admin/groups/{group_id}/tags/{kind}', {
			params: { path: { group_id: groupId, kind } }
		})
	);
}

export async function saveTag(kind: TagKind, id: string, body: PutAdminTag): Promise<AdminTag> {
	return responseData(
		await api.PUT('/v0/admin/tags/{kind}/{id}', { params: { path: { kind, id } }, body })
	);
}

export async function setTagHidden(kind: TagKind, id: string, hidden: boolean): Promise<void> {
	mutation(
		await api.PUT('/v0/admin/tags/{kind}/{id}/hidden', {
			params: { path: { kind, id } },
			body: hidden
		})
	);
}

export async function saveQuestionnaire(
	newsId: string,
	body: PutQuestionnaire
): Promise<AdminNews> {
	return responseData(
		await api.PUT('/v0/admin/news/{id}/questionnaire', {
			params: { path: { id: newsId } },
			body
		})
	);
}

export async function deleteQuestionnaire(newsId: string): Promise<void> {
	mutation(
		await api.DELETE('/v0/admin/news/{id}/questionnaire', {
			params: { path: { id: newsId } }
		})
	);
}

export async function listMemberRequests(groupId: string): Promise<AdminUser[]> {
	return responseData(
		await api.GET('/v0/admin/groups/{group_id}/member-requests', {
			params: { path: { group_id: groupId } }
		})
	);
}

export async function approveMemberRequest(groupId: string, memberId: string): Promise<void> {
	mutation(
		await api.PUT('/v0/admin/groups/{group_id}/member-requests/{member_id}', {
			params: { path: { group_id: groupId, member_id: memberId } }
		})
	);
}

export async function denyMemberRequest(groupId: string, memberId: string): Promise<void> {
	mutation(
		await api.DELETE('/v0/admin/groups/{group_id}/member-requests/{member_id}', {
			params: { path: { group_id: groupId, member_id: memberId } }
		})
	);
}

export async function listMembers(groupId: string): Promise<AdminMember[]> {
	return responseData(
		await api.GET('/v0/admin/groups/{group_id}/members', {
			params: { path: { group_id: groupId } }
		})
	);
}

export async function addMember(
	groupId: string,
	memberId: string,
	until: string | null = null
): Promise<void> {
	mutation(
		await api.PUT('/v0/admin/groups/{group_id}/members/{member_id}', {
			params: { path: { group_id: groupId, member_id: memberId } },
			body: { until: until ?? undefined }
		})
	);
}

export async function removeMember(groupId: string, memberId: string): Promise<void> {
	mutation(
		await api.DELETE('/v0/admin/groups/{group_id}/members/{member_id}', {
			params: { path: { group_id: groupId, member_id: memberId } }
		})
	);
}

export async function listAdmins(groupId: string): Promise<AdminUser[]> {
	return responseData(
		await api.GET('/v0/admin/groups/{group_id}/admins', {
			params: { path: { group_id: groupId } }
		})
	);
}

export async function listVisibleMembers(): Promise<AdminUser[]> {
	return responseData(await api.GET('/v0/admin/groups/visible-members'));
}

export async function addAdmin(groupId: string, userId: string): Promise<void> {
	mutation(
		await api.POST('/v0/admin/groups/{group_id}/admins', {
			params: { path: { group_id: groupId } },
			body: { user_id: userId }
		})
	);
}

export async function removeAdmin(groupId: string, userId: string): Promise<void> {
	mutation(
		await api.DELETE('/v0/admin/groups/{group_id}/admins/{user_id}', {
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
				await api.GET('/v0/admin/groups/{group_id}/joiner-groups', {
					params: { path: { group_id: groupId } }
				})
			)
		: responseData(
				await api.GET('/v0/admin/groups/{group_id}/activity-admin-groups', {
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
			await api.PUT('/v0/admin/groups/{group_id}/joiner-groups', {
				params: { path: { group_id: groupId } },
				body: { group_id: relatedId }
			})
		);
	} else {
		mutation(
			await api.PUT('/v0/admin/groups/{group_id}/activity-admin-groups', {
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
			await api.DELETE('/v0/admin/groups/{group_id}/joiner-groups/{joiner_id}', {
				params: { path: { group_id: groupId, joiner_id: relatedId } }
			})
		);
	} else {
		mutation(
			await api.DELETE('/v0/admin/groups/{group_id}/activity-admin-groups/{access_group_id}', {
				params: { path: { group_id: groupId, access_group_id: relatedId } }
			})
		);
	}
}
