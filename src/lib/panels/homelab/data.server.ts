import { get } from 'node:https';
import { cached, env, json, service, TIMEOUT } from '#lib/server/http.ts';

type Guest = { id: number; name: string; type: string; status: string; cpu: number; mem: number };

/* Proxmox refreshes these numbers every 10 s; the page polls at 10 s, so a 5 s cache always serves the latest.
   Proxmox counts a VM's page cache as used (balloon total_mem - free_mem), so a VM with a big page cache always
   reads ~95%. GLANCES_VMS names the VMs that run a Glances (mem plugin only is enough), as space-separated
   vmid=url pairs: theirs gives (total - available) / total, like `free`. Proxmox's number is the fallback. */
const pve = service('PVE_URL', 'PVE_TOKEN', (token) => ({ Authorization: `PVEAPIToken=${token}` }));
const wg = service('WGDASH_URL', 'WGDASH_KEY', (key) => ({ 'wg-dashboard-apikey': key }));

export const proxmox = () =>
	cached('proxmox', 5_000, async () => {
		const vms = (process.env.GLANCES_VMS ?? '').split(/\s+/).filter(Boolean).map((p) => p.split('='));
		const [{ data }, mem]: [{ data: any[] }, Map<number, number | null>] = await Promise.all([
			pve('/api2/json/cluster/resources'),
			Promise.all(vms.map(([id, url]) => json(`${url}/api/4/mem/percent`).then((m) => [Number(id), m.percent] as const, () => [Number(id), null] as const))).then((pairs) => new Map(pairs))
		]);
		const node = data.find((r) => r.type === 'node');
		return {
			host: { cpu: node.cpu * 100, mem: (node.mem / node.maxmem) * 100, disk: (node.disk / node.maxdisk) * 100, uptime: node.uptime as number },
			guests: data
				.filter((r) => (r.type === 'lxc' || r.type === 'qemu') && !r.template)
				.map((r): Guest => ({ id: r.vmid, name: r.name, type: r.type, status: r.status, cpu: r.cpu * 100, mem: mem.get(r.vmid) ?? (r.mem / r.maxmem) * 100 }))
				.sort((a, b) => a.id - b.id)
		};
	});

export const glances = () =>
	cached('glances', 30_000, async () => {
		const [url] = env('GLANCES_URL');
		const sensors: { label: string; value: number; warning: number }[] = await json(`${url}/api/4/sensors`);
		const pkg = sensors.find((s) => s.label.startsWith('Package'));
		return { temp: pkg?.value ?? null, warn: pkg?.warning ?? null };
	});

/* GUARDS_URL serves the media stack's VPN and antivirus checks as vpn-status.json and threat-status.json. */
export const guards = () =>
	cached('guards', 60_000, async () => {
		const [url] = env('GUARDS_URL');
		const [vpn, threat] = await Promise.all([json(`${url}/vpn-status.json`), json(`${url}/threat-status.json`)]);
		const bad = Object.entries(vpn.containers ?? {}).flatMap(([c, s]) => (s === 'ok' ? [] : [c]));
		return {
			vpn: { ok: vpn.status === 'OK' && !vpn.wan_leak && !bad.length, status: vpn.status as string, leak: !!vpn.wan_leak, bad, exit: vpn.exit_country as string, checked: vpn.checked as string },
			threat: { status: threat.status as string, total: threat.threats_total as number, last: threat.last_threat as string, scanned: threat.last_scan as string }
		};
	});

let sid: { id: string; until: number } | null = null;

export const pihole = () =>
	cached('pihole', 60_000, async () => {
		const [url, password] = env('PIHOLE_URL', 'PIHOLE_PASSWORD');
		if (!sid || sid.until < Date.now()) {
			const { session } = await json(`${url}/api/auth`, { method: 'POST', body: JSON.stringify({ password }) });
			if (!session.valid) throw new Error('pihole: auth failed');
			sid = { id: session.sid, until: Date.now() + (session.validity - 30) * 1000 };
		}
		const s = await json(`${url}/api/stats/summary`, { headers: { 'X-FTL-SID': sid.id } }).catch((e) => {
			sid = null;
			throw e;
		});
		return { queries: s.queries.total as number, blocked: s.queries.percent_blocked as number, clients: s.clients.active as number };
	});

export const truenas = () =>
	cached('truenas', 60_000, async () => {
		const [url, key] = env('TRUENAS_URL', 'TRUENAS_KEY');
		if (!url.startsWith('https://')) throw new Error('TRUENAS_URL must be https (TrueNAS revokes keys used over http)');
		/* The name check is off (self-signed, CN=localhost). The cert is still checked against the trusted CAs plus the
		   NODE_EXTRA_CA_CERTS bundle: that is trust, not pinning, so any cert a trusted CA signed passes.
		   ponytail: no pinning; check the cert's fingerprint in checkServerIdentity if that matters. */
		const body = await new Promise<string>((ok, fail) => {
			const req = get(`${url}/api/v2.0/pool`, { headers: { Authorization: `Bearer ${key}` }, checkServerIdentity: () => undefined, timeout: TIMEOUT }, (res) => {
				let text = '';
				res.on('data', (c) => (text += c));
				res.on('end', () => (res.statusCode === 200 ? ok(text) : fail(new Error(`truenas: HTTP ${res.statusCode}`))));
			});
			req.on('timeout', () => req.destroy(new Error('truenas: timeout')));
			req.on('error', fail);
		});
		return (JSON.parse(body) as any[]).map((p) => ({ name: p.name as string, status: p.status as string, healthy: !!p.healthy, used: (p.allocated / p.size) * 100 }));
	});

export const wgdash = () =>
	cached('wgdash', 60_000, async () => {
		const { data } = await wg('/api/getWireguardConfigurations');
		return Promise.all(
			(data as { Name: string; Status: boolean }[]).map(async (c) => {
				const info = await wg(`/api/getWireguardConfigurationInfo?configurationName=${encodeURIComponent(c.Name)}`);
				return {
					name: c.Name,
					up: c.Status,
					peers: (info.data.configurationPeers as any[]).map((p) => ({ name: p.name as string, online: p.status === 'running', handshake: p.latest_handshake as string }))
				};
			})
		);
	});

export const sources = { proxmox, glances, guards, pihole, truenas, wgdash };
