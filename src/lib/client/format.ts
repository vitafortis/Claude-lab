export function bytes(n: number | null | undefined): string {
	if (n == null) return '—';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let i = 0;
	let v = n;
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i++;
	}
	return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function ago(iso: string | null | undefined): string {
	if (!iso) return 'never';
	const s = (Date.now() - new Date(iso).getTime()) / 1000;
	if (s < 45) return 'just now';
	if (s < 3600) return `${Math.round(s / 60)}m ago`;
	if (s < 86400) return `${Math.round(s / 3600)}h ago`;
	if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
	return new Date(iso).toLocaleDateString();
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
