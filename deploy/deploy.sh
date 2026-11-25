#!/bin/sh
# An example deploy to a Proxmox LXC (Alpine, OpenRC, deploy/dash.openrc): ships .env and the working tree (untracked
# files too, such as links.json and ca.pem) to the container through its Proxmox node, then builds and restarts there.
# .env names them: DEPLOY_SSH (the node's ssh host) and DEPLOY_CT (the container id).
set -eu
cd "$(dirname "$0")/.."
# One key of .env, read rather than sourced: values with spaces or quotes would break sh.
key() {
	v=$(sed -n "s/^$1=//p" .env | tail -n 1)
	[ -n "$v" ] || { echo "deploy: $1 is not set in .env" >&2; exit 1; }
	printf '%s' "$v"
}
SSH=$(key DEPLOY_SSH)
CT=$(key DEPLOY_CT)
{
	grep -v -e '^NODE_EXTRA_CA_CERTS=' -e '^DEPLOY_' .env
	printf '%s\n' DB_PATH=/var/lib/dash/dash.db HOST=0.0.0.0 PORT=3000
} | ssh "$SSH" "pct exec $CT -- sh -c 'umask 027 && cat > /etc/dash.env && chgrp dash /etc/dash.env && chmod 640 /etc/dash.env'"
tar -c --exclude=node_modules --exclude=.svelte-kit --exclude=build --exclude=.git --exclude=.direnv --exclude=.claude --exclude=.env --exclude='*.db' . |
	ssh "$SSH" "pct exec $CT -- sh -c 'set -e
		rm -rf /opt/dash/src /opt/dash/static
		mkdir -p /opt/dash && tar -x --no-same-owner -C /opt/dash
		cd /opt/dash && npm ci --no-audit --no-fund && npm run build && npm prune --omit=dev
		install -m 755 deploy/dash.openrc /etc/init.d/dash
		rc-update add dash default >/dev/null
		rc-service dash restart'"
