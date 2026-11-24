/** What a caught error says: its message, or the thing itself as text. */
export const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
