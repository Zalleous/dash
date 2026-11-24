import ical from 'node-ical';
import { env, http } from '#lib/server/http.ts';
import { isoDay } from '#lib/time.ts';

const urls = () => env('CAL_ICS')[0].split(/\s+/).filter(Boolean);
const text = (v: unknown) => (typeof v === 'string' ? v : ((v as { val?: string })?.val ?? ''));

async function load(days: number) {
	const from = new Date();
	from.setHours(0, 0, 0, 0);
	const to = new Date(from.getTime() + days * 86400000);
	const feeds = await Promise.allSettled(urls().map(async (url) => ical.sync.parseICS(await (await http(url)).text())));
	/* expandOngoing also keeps an event that ends exactly at `from`, i.e. yesterday's all-day ones: end > from drops it. */
	const events = feeds.flatMap((feed, cal) =>
		feed.status === 'rejected'
			? []
			: Object.values(feed.value).flatMap((e) =>
					e?.type !== 'VEVENT' ? [] : ical.expandRecurringEvent(e, { from, to, expandOngoing: true }).flatMap((x) => (x.end > from ? [{ ...x, cal }] : []))
				)
	);
	events.sort((a, b) => a.start.getTime() - b.start.getTime());
	const failed = feeds.filter((f) => f.status === 'rejected').length;
	return { events, failed };
}

export async function calendar() {
	const { events, failed } = await load(8);
	return {
		events: events.map((x) => ({
			title: text(x.summary),
			start: x.isFullDay ? isoDay(x.start) : x.start.toISOString(),
			end: x.isFullDay ? isoDay(x.end) : x.end.toISOString(),
			allDay: x.isFullDay,
			t: x.start.getTime(),
			cal: x.cal
		})),
		failed
	};
}

export async function deadlines() {
	const { events, failed } = await load(60);
	return {
		events: events
			.filter((x) => x.isFullDay && x.event.transparency !== 'TRANSPARENT')
			.map((x) => ({ title: text(x.summary), date: isoDay(x.start), t: x.start.getTime() })),
		failed
	};
}
