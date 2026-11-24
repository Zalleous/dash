import { cached, json } from '#lib/server/http.ts';

const CODES: [number, string][] = [
	[0, 'clear'],
	[2, 'partly cloudy'],
	[3, 'overcast'],
	[48, 'fog'],
	[57, 'drizzle'],
	[67, 'rain'],
	[77, 'snow'],
	[82, 'showers'],
	[86, 'snow showers'],
	[99, 'thunderstorm']
];

/* The place's first match on Open-Meteo, kept a day: a place does not move. */
const find = (place: string) =>
	cached(`geocode:${place}`, 86_400_000, async () => {
		const { results } = await json(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1`);
		if (!results?.length) throw new Error('place not found');
		return results[0] as { name: string; latitude: number; longitude: number };
	});

/* timezone=auto: the day and the sun times are the place's own. place says which setting the answer is for. */
export async function weather({ place }: { place: string }) {
	const at = await find(place);
	const { current: c, daily: d } = await json(
		`https://api.open-meteo.com/v1/forecast?latitude=${at.latitude}&longitude=${at.longitude}&timezone=auto` +
			'&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m' +
			'&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&forecast_days=1'
	);
	return {
		place,
		name: at.name,
		temp: Math.round(c.temperature_2m),
		feels: Math.round(c.apparent_temperature),
		wind: Math.round(c.wind_speed_10m),
		sky: CODES.find(([max]) => c.weather_code <= max)?.[1] ?? '?',
		hi: Math.round(d.temperature_2m_max[0]),
		lo: Math.round(d.temperature_2m_min[0]),
		rain: d.precipitation_probability_max[0],
		sunrise: d.sunrise[0].slice(11),
		sunset: d.sunset[0].slice(11)
	};
}

/* One cache per place, so two weather tiles for one place share it. */
export const sources = { weather: (s: { place: string }) => cached(`weather:${s.place}`, 10 * 60_000, () => weather(s)) };
