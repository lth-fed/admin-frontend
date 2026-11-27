import type { components } from './generated/minilith';

type GeneratedActivity = components['schemas']['Activity'];
export type Activity = GeneratedActivity & { base_ticket?: string };
export type ActivityHostInvite = components['schemas']['ActivityHostInvite'];
export type BriefActivity = components['schemas']['BriefActivity'];
export type PutActivity = components['schemas']['PutActivity'];
export type ReportRequest = components['schemas']['ReportRequest'];
export type ExternalSaleCategory = components['schemas']['ExternalSaleCategory'];
export type ActivityTicketKind = components['schemas']['ActivityTicketKind'];
/** Legacy app-facing ticket-kind shape; still returned by the deprecated `/tickets` API. */
export type TicketKind = components['schemas']['Kind'];
export type AvailableAddon = components['schemas']['AvailableAddon'];
export type AdminProduct = components['schemas']['AdminProduct'] & {
	/** The base-price add-on's split over product tags. Remove once regenerated. */
	bookkeeping_tag_ids?: string[];
	bookkeeping_prices?: number[];
};
export type AdminProductKind = components['schemas']['AdminProductKind'];
export type AdminSalesTarget = components['schemas']['AdminSalesTarget'];
export type AdminProductTag = components['schemas']['AdminProductTag'];
export type AdminTag = components['schemas']['AdminTag'];
export type TicketBuyer = components['schemas']['TicketBuyer'];
export type PutAdminTag = components['schemas']['PutAdminTag'];
/** Editor state sends addon ids, but keeps the full addons around for display. */
export type PutProduct = Omit<
	components['schemas']['PutProduct'],
	'addon_ids' | 'bookkeeping_tag' | 'bookkeeping_price_categories'
> & {
	addons: AvailableAddon[];
	/** Splits `price` over product tags on the base-price add-on. Remove once regenerated. */
	bookkeeping_tag_ids: string[];
	bookkeeping_prices: number[];
};
export type PutNotification = components['schemas']['PutNotification'];
export type ActivityNotification = components['schemas']['ActivityNotification'];
export type PutActivityNotification = components['schemas']['PutActivityNotification'];
export type ActivityNotificationKind = components['schemas']['ActivityNotificationKind'];
export type GroupNotification = components['schemas']['GroupNotification'];
export type AdminNews = components['schemas']['AdminNews'];
export type AdminNewsSummary = components['schemas']['AdminNewsSummary'];
export type AdminNewsTag = components['schemas']['AdminNewsTag'];
export type AdminQuestion = components['schemas']['AdminQuestion'];
export type AdminQuestionOption = components['schemas']['AdminQuestionOption'];
export type AdminQuestionnaire = components['schemas']['AdminQuestionnaire'];
export type PutNews = components['schemas']['PutNews'];
export type PutQuestionnaire = components['schemas']['PutQuestionnaire'];
export type PurchasedTicket = components['schemas']['AdminPurchasedTicket'];
export type AdminResale = components['schemas']['AdminResale'];
export type PhysicalSalesClient = components['schemas']['PhysicalSalesClient'];
export type CreatedUser = components['schemas']['CreatedUser'];
/** A direct group member; `until` is when the membership ends (absent = never). */
export type AdminMember = components['schemas']['AdminMember'];

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

export type StockLine = {
	product_id: string;
	name: Record<string, string>;
	sales_stock?: number;
	stock_real: number;
	stock_unit: string;
	stock_price: number;
};

export type StockRecordKind =
	| 'purchase'
	| 'refund'
	| 'sales'
	| 'sales-refund'
	| 'take-out'
	| 'put-back'
	| 'balance'
	| 'inventory';

export type StockPoint = { time: string; stock_real: number };

export type StockRecord = {
	product_id: string;
	product_name: Record<string, string>;
	amount: number;
	kind: StockRecordKind;
};

export type StockTransaction = {
	id: string;
	name: Record<string, string>;
	activity_id?: string;
	time: string;
	records: StockRecord[];
};

export type VoteMeeting = {
	id: string;
	group_id: string;
	activity_id?: string;
	title: Record<string, string>;
	secure_voting: boolean;
};
export type VoteAlternative = {
	id: string;
	title: Record<string, string>;
	voted_for: number;
};
export type VoteRound = {
	id: string;
	title: Record<string, string>;
	open: boolean;
	max_choices: number;
	alternatives: VoteAlternative[];
	has_voted?: boolean;
};
export type AdminVoteMeeting = components['schemas']['AdminVoteMeeting'];
export type VoteMeetingAdmin = { user_id: string; readonly: boolean };

export type PutStockTransaction = {
	id: string;
	name: Record<string, string>;
	activity_id?: string;
	records: { product_id: string; amount: number; kind: StockRecordKind }[];
};
/** Narrow shape used by purchase tables: only what is needed for pricing/labels. */
export type PurchaseKind = {
	ticket_kind_id: string;
	ticket_kind_name: Record<string, string>;
	price: number;
	available_addons: AvailableAddon[];
};
export type AdminUser = components['schemas']['AdminUser'];
type GeneratedGroup = components['schemas']['Group'];
export type Group = GeneratedGroup & { stock_tracking?: boolean };
export type PutGroup = components['schemas']['PutGroup'];
export type Me = components['schemas']['Me'];
export type UploadAllowance = components['schemas']['ObjectUploadAllowanceResponse'];

/** One purchase in the purchases view. Remove once the server's OpenAPI schema is regenerated. */
export type AdminPurchaseRow = {
	id: string;
	product_id: string;
	product_name: Record<string, string>;
	kind: AdminProductKind;
	activity_id?: string;
	purchased_at: string;
	purchaser_id: string;
	purchaser_name: string;
	owner_id: string;
	owner_name: string;
	paid_price: number;
	for_resale?: number;
	refunded: boolean;
	uses: number;
	max_uses: number;
	has_receipt: boolean;
};
/** One ownership step of a purchase. */
export type AdminPurchaseHistoryStep = {
	buyer_id: string;
	buyer_name: string;
	/** The group for the first sale. */
	seller_id?: string;
	seller_name: string;
	completed_at: string;
	/** Missing when the ticket was transferred instead of sold. */
	transaction_id?: string;
	/** What the buyer paid in this step (in ören); missing for transfers. */
	paid?: number;
	/** What was refunded to this buyer (in ören), if their payment was refunded. */
	refunded?: number;
};
/** A product's sales over an interval. Remove once the server's OpenAPI schema is regenerated. */
export type SoldProduct = {
	product_id: string;
	name: Record<string, string>;
	kind: AdminProductKind;
	max_uses: number;
	sold: number;
	refunded: number;
	revenue: number;
	uses: number;
	uses_possible: number;
};
