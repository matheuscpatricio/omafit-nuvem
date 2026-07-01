const supabaseUrl = String(
	(typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) || "",
).replace(/\/+$/, "");
const supabaseAnonKey = String(
	(typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_ANON_KEY) || "",
);

type QueryResult<T> = { data: T | null; error: { message: string } | null };

function restHeaders() {
	return {
		apikey: supabaseAnonKey,
		Authorization: `Bearer ${supabaseAnonKey}`,
		"Content-Type": "application/json",
	};
}

export const supabase = {
	from(table: string) {
		const base = `${supabaseUrl}/rest/v1/${table}`;
		let query = "";
		return {
			select(columns: string) {
				query = `select=${encodeURIComponent(columns)}`;
				return this;
			},
			eq(column: string, value: string) {
				query += `${query ? "&" : ""}${column}=eq.${encodeURIComponent(value)}`;
				return this;
			},
			async maybeSingle(): Promise<QueryResult<Record<string, unknown>>> {
				if (!supabaseUrl || !supabaseAnonKey) {
					return { data: null, error: { message: "Supabase not configured" } };
				}
				const response = await fetch(`${base}?${query}&limit=1`, {
					headers: restHeaders(),
				});
				if (!response.ok) {
					return { data: null, error: { message: await response.text() } };
				}
				const rows = await response.json();
				return { data: Array.isArray(rows) ? rows[0] || null : null, error: null };
			},
			async then<TResult1 = QueryResult<Record<string, unknown>[]>, TResult2 = never>(
				onfulfilled?: ((value: QueryResult<Record<string, unknown>[]>) => TResult1 | PromiseLike<TResult1>) | null,
				onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
			) {
				try {
					if (!supabaseUrl || !supabaseAnonKey) {
						return Promise.resolve(onfulfilled?.({ data: [], error: null } as never) as TResult1);
					}
					const response = await fetch(`${base}?${query}`, { headers: restHeaders() });
					if (!response.ok) {
						return Promise.resolve(
							onfulfilled?.({
								data: [],
								error: { message: await response.text() },
							} as never) as TResult1,
						);
					}
					const data = await response.json();
					return Promise.resolve(onfulfilled?.({ data, error: null } as never) as TResult1);
				} catch (error) {
					return onrejected ? Promise.resolve(onrejected(error)) : Promise.reject(error);
				}
			},
		};
	},
};
