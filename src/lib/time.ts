/** A day as YYYY-MM-DD in local time. */
export const isoDay = (d = new Date()) => d.toLocaleDateString('en-CA');
export const pad2 = (n: number) => String(n).padStart(2, '0');
/** A span as hh:mm:ss; the hours keep counting past 24. */
export const hms = (ms: number) => {
	const s = Math.floor(ms / 1000);
	return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(pad2).join(':');
};
export function dur(ms: number) {
	const m = Math.max(0, Math.round(ms / 60_000));
	return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
}

const hmFormat = new Intl.DateTimeFormat('en-CA', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const hm = (t: number) => hmFormat.format(t);

export const daysLeft = (date: string, now = new Date()) =>
	Math.round((new Date(date + 'T00:00').getTime() - new Date(now.toDateString()).getTime()) / 86400000);

/** A day count from daysLeft() in words: today, tomorrow, 3d, -2d. */
export const until = (n: number) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `${n}d`);

export const endT = (e: { allDay: boolean; end: string }) => (e.allDay ? new Date(e.end + 'T00:00').getTime() : Date.parse(e.end));
