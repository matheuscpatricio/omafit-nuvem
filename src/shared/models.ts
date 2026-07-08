export type OmafitPlanId = "ondemand" | "growth" | "pro" | "enterprise";

export type OmafitPlanDefinition = {
	id: OmafitPlanId;
	name: string;
	description: string;
	monthlyPrice: number;
	monthlyPriceUsd?: number;
	annualPriceUsd?: number;
	annualDiscountUsd?: number;
	imagesIncluded: number;
	unlimitedTryOn?: boolean;
	pricePerExtraImage: number;
	currency: string;
	featureKeys?: string[];
};

export type OmafitUsageSummary = {
	plan: string;
	imagesIncluded: number;
	imagesUsed: number;
	remaining: number | null;
	extraImages: number;
	pricePerExtraImage: number;
	currency: string;
	percentage: number;
	unlimited?: boolean;
	pendingOverageAmount?: number;
	pendingOverageUnits?: number;
	extraCost?: number;
	billingMode?: string;
};

export type OmafitStripeBillingSummary = {
	configured: boolean;
	customerId: string | null;
	subscriptionId: string | null;
	paymentStatus: string | null;
	hasPaymentMethod: boolean;
};

export type OmafitAdminContext = {
	appName: string;
	supportUrl: string;
	supportEmail: string;
	store: {
		id: string | null;
		url: string;
		name: string;
		currency: string;
		language: string;
	};
	auth: {
		connected: boolean;
		lastSyncAt: string | null;
		webhooksSyncedAt: string | null;
		authUrl: string;
	};
	billing: {
		status: string;
		plan: string;
		mode?: string;
		usage: OmafitUsageSummary;
		plans: OmafitPlanDefinition[];
		stripe?: OmafitStripeBillingSummary;
	};
};

export type OmafitWidgetConfig = {
	link_text: string;
	store_logo: string | null;
	primary_color: string;
	widget_enabled: boolean;
	excluded_collections: string[];
	admin_locale: string;
	embed_position?: "below_buy_buttons" | "above_buy_buttons";
	cta_type?: "link" | "button";
	cta_button_border_radius?: number;
	tryon_layout?: "default" | "sidebar" | "hero";
	tryon_layout_background_image?: string | null;
	tryon_enabled?: boolean;
};

export type OmafitProduct = {
	id: string;
	handle: string;
	title: string;
	collections: OmafitCollection[];
};

export type OmafitCollection = {
	id: string | number;
	handle: string;
	title: string;
	parent: string | number | null;
};

export type OmafitSizeRow = {
	size: string;
	[key: string]: string;
};

export type OmafitSizeChart = {
	collection_handle: string;
	product_handle?: string;
	gender_scope?: "both" | "male" | "female";
	gender: "male" | "female" | "unisex";
	collection_type: "upper" | "lower" | "full" | "footwear";
	collection_elasticity: "structured" | "light_flex" | "flexible" | "high_elasticity" | "";
	measurement_refs: string[];
	sizes: OmafitSizeRow[];
};

export type OmafitAnalyticsSummary = {
	totalSessions: number;
	usage: OmafitUsageSummary;
	avgByGender: {
		male: { height: number | null; weight: number | null };
		female: { height: number | null; weight: number | null };
	};
	usageByCollection: Array<{
		collection: string;
		count: number;
		percent: number;
	}>;
	sizeDistribution: Array<{
		size: string;
		count: number;
		percent: number;
	}>;
	bodyTypeDistribution: Array<{
		bodyType: string;
		count: number;
		percent: number;
	}>;
	topRecommendations: Array<{
		collection: string;
		gender: string;
		recommendedSize: string | null;
		bodyType: string | null;
	}>;
	orderMetrics: {
		ordersBefore?: number | null;
		ordersAfter: number;
		omafitOrdersAfter: number;
		omafitRevenueAfter: number;
		returnsBefore?: number | null;
		returnsAfter: number;
		conversionBefore?: number | null;
		conversionAfter?: number | null;
		installDate?: string | null;
		periodDays?: number;
	};
	byCollectionGender?: Array<{
		collection: string;
		gender: string;
		mostSize: { value: string; count: number } | null;
		mostFit: { value: string; count: number } | null;
		mostBodyType: { value: string; count: number } | null;
	}>;
	performance?: {
		sessionsTotal: number;
		sessionsWithProfile: number;
		sessionsWithRecommendation: number;
		avgSessionSeconds: number | null;
		usageByCollection: Array<{
			collection: string;
			count: number;
			percent: number;
		}>;
	};
	quality?: {
		recommendationCoveragePercent: number | null;
		tableDivergenceAlert: string;
	};
	intelligence?: {
		bodyTypeDistribution: Array<{
			bodyType: string;
			count: number;
			percent: number;
		}>;
		sizeDistribution: Array<{
			size: string;
			count: number;
			percent: number;
		}>;
		heatmapRows: Array<{
			collection: string;
			size: string;
			count: number;
		}>;
	};
	finance?: {
		estimatedRoiPercent: number | null;
		attributedRevenue: number | null;
		estimatedCostAvoided: number | null;
	};
	currency?: string;
};
