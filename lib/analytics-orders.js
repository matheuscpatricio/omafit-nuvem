export async function fetchOrderMetricsFromNuvemshop({
	session,
	nuvemshopApi,
	installDate,
	periodDays,
}) {
	const period = Math.max(1, Math.min(365, Number(periodDays) || 30));
	const installMs = installDate ? new Date(installDate).getTime() : null;
	const now = Date.now();
	const afterSince = new Date(now - period * 24 * 60 * 60 * 1000);
	const beforeUntil = installMs ? new Date(installMs) : null;
	const beforeSince = beforeUntil
		? new Date(beforeUntil.getTime() - period * 24 * 60 * 60 * 1000)
		: null;

	let ordersBefore = 0;
	let ordersAfter = 0;
	let returnsBefore = 0;
	let returnsAfter = 0;

	for (let page = 1; page <= 10; page += 1) {
		const response = await nuvemshopApi(
			session,
			`/orders?per_page=200&page=${page}&fields=id,created_at,payment_status,status`,
			{ method: "GET" },
		);
		if (!response.ok) break;
		const rows = await response.json().catch(() => []);
		if (!Array.isArray(rows) || rows.length === 0) break;

		for (const order of rows) {
			const createdMs = new Date(order.created_at || "").getTime();
			if (!Number.isFinite(createdMs)) continue;
			const isPaid =
				String(order.payment_status || "").toLowerCase() === "paid" ||
				String(order.status || "").toLowerCase() === "closed";
			const isReturned = String(order.status || "").toLowerCase().includes("cancel");

			if (createdMs >= afterSince.getTime()) {
				if (isPaid) ordersAfter += 1;
				if (isReturned) returnsAfter += 1;
			}
			if (
				beforeSince &&
				beforeUntil &&
				createdMs >= beforeSince.getTime() &&
				createdMs < beforeUntil.getTime()
			) {
				if (isPaid) ordersBefore += 1;
				if (isReturned) returnsBefore += 1;
			}
		}
		if (rows.length < 200) break;
	}

	const conversionBefore =
		ordersBefore > 0 ? ((ordersBefore - returnsBefore) / ordersBefore) * 100 : null;
	const conversionAfter =
		ordersAfter > 0 ? ((ordersAfter - returnsAfter) / ordersAfter) * 100 : null;

	return {
		ordersBefore: beforeSince ? ordersBefore : null,
		ordersAfter,
		returnsBefore: beforeSince ? returnsBefore : null,
		returnsAfter,
		conversionBefore,
		conversionAfter,
		installDate: installDate || null,
		periodDays: period,
	};
}
