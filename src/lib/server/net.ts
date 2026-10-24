/** Address matching for trusted proxies: exact addresses and CIDR ranges, IPv4 and IPv6. */
import { isIP } from 'node:net';

function toBig(ip: string): { v: bigint; bits: number } | null {
	// ::ffff:10.0.0.1 is an IPv4 client on a dual-stack socket.
	const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
	if (mapped) ip = mapped[1];
	const kind = isIP(ip);
	if (kind === 4) return { v: ip.split('.').reduce((a, o) => (a << 8n) + BigInt(Number(o)), 0n), bits: 32 };
	if (kind !== 6) return null;
	const zone = ip.indexOf('%');
	if (zone !== -1) ip = ip.slice(0, zone);
	let [head, tail] = ip.split('::') as [string, string | undefined];
	const parse = (s: string) => (s ? s.split(':') : []);
	let parts = parse(head);
	let rest = tail === undefined ? [] : parse(tail);
	// An embedded IPv4 tail (::ffff:1.2.3.4 already handled; e.g. 64:ff9b::1.2.3.4).
	const last = (tail === undefined ? parts : rest).at(-1);
	if (last?.includes('.')) {
		const o = last.split('.').map(Number);
		const arr = tail === undefined ? parts : rest;
		arr.splice(-1, 1, ((o[0] << 8) | o[1]).toString(16), ((o[2] << 8) | o[3]).toString(16));
	}
	if (tail !== undefined) parts = [...parts, ...Array(8 - parts.length - rest.length).fill('0'), ...rest];
	if (parts.length !== 8) return null;
	return { v: parts.reduce((a, h) => (a << 16n) + BigInt(parseInt(h || '0', 16)), 0n), bits: 128 };
}

export function ipMatches(ip: string, ranges: string[]): boolean {
	const addr = toBig(ip.trim());
	if (!addr) return false;
	return ranges.some((r) => {
		const [base, len] = r.trim().split('/');
		const net = toBig(base);
		if (!net || net.bits !== addr.bits) return false;
		const prefix = len === undefined ? net.bits : Number(len);
		if (!Number.isInteger(prefix) || prefix < 0 || prefix > net.bits) return false;
		const shift = BigInt(net.bits - prefix);
		return addr.v >> shift === net.v >> shift;
	});
}

/** An address or CIDR range someone typed. */
export function isRange(s: string): boolean {
	const [base, len] = s.trim().split('/');
	const a = toBig(base);
	if (!a) return false;
	if (len === undefined) return true;
	const n = Number(len);
	return Number.isInteger(n) && n >= 0 && n <= a.bits;
}
