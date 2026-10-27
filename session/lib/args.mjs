// Prints Claude Code's arguments for this launch, NUL-separated, for orb-launch.
// Orbital computes them and writes /session/.orb/launch.json before each launch.
import { readFileSync } from 'node:fs';

let args = [];
try {
	const launch = JSON.parse(readFileSync('/session/.orb/launch.json', 'utf8'));
	if (Array.isArray(launch.args)) args = launch.args.filter((a) => typeof a === 'string');
} catch {}
process.stdout.write(args.map((a) => `${a}\0`).join(''));
