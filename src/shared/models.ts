export type OmafitPlanId = "ondemand" | "growth" | "professional";

export type OmafitPlanDefinition = {
	id: OmafitPlanId;
	name: string;
	description: string;
	imagesIncluded: number;
	pricePerExtraImage: number;
	currency: string;
};

export type OmafitUsageSummary = {
	plan: string;
	imagesIncluded: number;
	imagesUsed: number;
	remaining: number;
	extraImages: number;
	pricePerExtraImage: number;
	currency: string;
	percentage: number;
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
		usage: OmafitUsageSummary;
		plans: OmafitPlanDefinition[];
	};
};

export type OmafitWidgetConfig = {
	link_text: string;
	store_logo: string | null;
	primary_color: string;
	widget_enabled: boolean;
	excluded_collections: string[];
	admin_locale: string;
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
		ordersAfter: number;
		omafitOrdersAfter: number;
		omafitRevenueAfter: number;
		returnsAfter: number;
	};
};
