import { closeSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { conversationInfo, excerpt, summarizeTranscript } from '#lib/transcript.ts';
import { conversationsDir } from './storage.ts';
import type { Conversation, Session, TranscriptSummary } from '#lib/types.ts';

// Long sessions grow large transcripts; the overview only needs the recent part.
const MAX_READ = 24 * 1024 * 1024;

type FileInfo = { path: string; id: string; mtimeMs: number; size: number };

function transcriptFiles(s: Pick<Session, 'id' | 'claudeAccountId'>): FileInfo[] {
	const dir = conversationsDir(s.claudeAccountId, s.id);
	let names: string[];
	try {
		names = readdirSync(dir);
	} catch {
		return [];
	}
	const out: FileInfo[] = [];
	for (const n of names) {
		if (!n.endsWith('.jsonl')) continue;
		try {
			const st = statSync(join(dir, n));
			if (st.isFile() && st.size > 0) out.push({ path: join(dir, n), id: basename(n, '.jsonl'), mtimeMs: st.mtimeMs, size: st.size });
		} catch {}
	}
	return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/** Reads a transcript, or its last MAX_READ bytes (starting at a line boundary). */
function readTail(f: FileInfo, max = MAX_READ): string {
	const len = Math.min(f.size, max);
	const buf = Buffer.alloc(len);
	const fd = openSync(f.path, 'r');
	try {
		readSync(fd, buf, 0, len, f.size - len);
	} finally {
		closeSync(fd);
	}
	const text = buf.toString('utf8');
	return len < f.size ? text.slice(text.indexOf('\n') + 1) : text;
}

export function hasConversations(s: Pick<Session, 'id' | 'claudeAccountId'>): boolean {
	return transcriptFiles(s).length > 0;
}

const cache = new Map<string, { mtimeMs: number; size: number; summary: TranscriptSummary }>();

/** A summary of the session's newest conversation, re-read only when the file changed. */
export function latestSummary(s: Pick<Session, 'id' | 'claudeAccountId'>): TranscriptSummary | null {
	const f = transcriptFiles(s)[0];
	if (!f) return null;
	const hit = cache.get(f.path);
	if (hit && hit.mtimeMs === f.mtimeMs && hit.size === f.size) return hit.summary;
	const summary = summarizeTranscript(readTail(f), f.id, new Date(f.mtimeMs).toISOString());
	cache.set(f.path, { mtimeMs: f.mtimeMs, size: f.size, summary });
	return summary;
}

export function listConversations(s: Pick<Session, 'id' | 'claudeAccountId'>): Conversation[] {
	return transcriptFiles(s)
		.slice(0, 50)
		.map((f) => {
			const info = conversationInfo(readTail(f, 4 * 1024 * 1024));
			return { id: f.id, ...info, updatedAt: new Date(f.mtimeMs).toISOString(), bytes: f.size };
		})
		.filter((c) => c.messages > 0);
}

/** Recent turns of the newest conversation as plain text (for an AI summary). */
export function latestExcerpt(s: Pick<Session, 'id' | 'claudeAccountId'>): string | null {
	const f = transcriptFiles(s)[0];
	return f ? excerpt(readTail(f)) : null;
}
