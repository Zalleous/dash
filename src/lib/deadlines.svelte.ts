import { poll, type Deadlines, type Todos } from '#lib/poll.svelte.ts';

/* A deadline is both a calendar all-day event and a todo card with the same title. It shows once, in the
   deadlines panel: dated are the deadline titles, live the deadlines whose card is not done yet. Todo, deadlines and
   agenda each call this; the polls behind it are shared (poll.svelte.ts). */
export function trackDeadlines() {
	const todos = poll<Todos>('/api/todos', 60_000);
	const deadlines = poll<Deadlines>('/api/deadlines', 15 * 60_000);
	const dated = $derived(new Set(deadlines.data?.events.map((e) => e.title)));
	const live = $derived(deadlines.data?.events.filter((e) => !todos.data?.done.includes(e.title)) ?? []);
	return {
		todos,
		deadlines,
		get dated() {
			return dated;
		},
		get live() {
			return live;
		}
	};
}
