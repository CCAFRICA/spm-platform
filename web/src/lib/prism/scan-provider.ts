/**
 * ScanProvider — the swappable malware-scan boundary (DS-031 §3.3).
 *
 * Engine: ClamAV (the named engine). The HOST is swappable behind this
 * interface; the scan-before-promote invariant does NOT depend on the host:
 *   - `clamd`    : INSTREAM over TCP to a clamd daemon (local now; a deployed
 *                  clamd / container / managed ClamAV endpoint later).
 *   - `clamscan` : one-shot `clamscan` binary via child_process (no daemon).
 *   - `api`      : a managed AV REST API (env-configured URL + key).
 *
 * Selected by env `PRISM_SCAN_PROVIDER` (default `clamd`). There is NO stub
 * that auto-passes: an unconfigured/unreachable provider yields verdict
 * `error`, which the gate treats as held — fail-closed, never promote.
 *
 * The interface signature is `scan(objectPath)` per the directive; providers
 * obtain bytes via the injected `ObjectByteFetcher` so they stay decoupled
 * from the storage layer.
 */

import net from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ScanResult } from './types';

/** Fetches the raw bytes of a quarantined object by its storage path. */
export type ObjectByteFetcher = (objectPath: string) => Promise<Buffer>;

export interface ScanProvider {
  readonly name: string;
  scan(objectPath: string): Promise<ScanResult>;
}

// ── ClamAV reply parsing (shared) ─────────────────────────────────────────

/** Parse a clamd/clamscan stream reply into a structured verdict. */
function parseClamReply(reply: string, engineVersion: string): ScanResult {
  const text = reply.replace(/\0/g, '').trim();
  if (/\bFOUND\b/.test(text)) {
    const m = text.match(/:\s*(.+?)\s+FOUND/);
    return { verdict: 'infected', engineVersion, detail: (m?.[1] ?? text).trim() };
  }
  if (/\bOK\b/.test(text)) {
    return { verdict: 'clean', engineVersion, detail: text || 'OK' };
  }
  return { verdict: 'error', engineVersion, detail: text || 'empty scan reply' };
}

// ── clamd INSTREAM provider ───────────────────────────────────────────────

class ClamdScanProvider implements ScanProvider {
  readonly name = 'clamav-clamd';
  private static readonly CHUNK = 64 * 1024;
  private static readonly TIMEOUT_MS = 120_000;

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly fetchBytes: ObjectByteFetcher,
  ) {}

  async scan(objectPath: string): Promise<ScanResult> {
    let bytes: Buffer;
    try {
      bytes = await this.fetchBytes(objectPath);
    } catch (err) {
      return { verdict: 'error', engineVersion: 'unknown', detail: `fetch failed: ${String(err)}` };
    }
    let engineVersion = 'clamav';
    try {
      engineVersion = await this.command('zVERSION\0');
    } catch {
      /* version is best-effort; a scan failure below is what matters */
    }
    try {
      const reply = await this.instream(bytes);
      return parseClamReply(reply, engineVersion.replace(/\0/g, '').trim() || 'clamav');
    } catch (err) {
      return { verdict: 'error', engineVersion, detail: `clamd error: ${String(err)}` };
    }
  }

  /** Send a single null-terminated command, return the reply text. */
  private command(cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      const chunks: Buffer[] = [];
      socket.setTimeout(ClamdScanProvider.TIMEOUT_MS, () => {
        socket.destroy();
        reject(new Error('clamd command timeout'));
      });
      socket.on('error', reject);
      socket.on('connect', () => socket.write(cmd));
      socket.on('data', (d) => chunks.push(d));
      socket.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
  }

  /** Stream bytes to clamd via the INSTREAM protocol. */
  private instream(bytes: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      const chunks: Buffer[] = [];
      socket.setTimeout(ClamdScanProvider.TIMEOUT_MS, () => {
        socket.destroy();
        reject(new Error('clamd scan timeout'));
      });
      socket.on('error', reject);
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        for (let i = 0; i < bytes.length; i += ClamdScanProvider.CHUNK) {
          const slice = bytes.subarray(i, Math.min(i + ClamdScanProvider.CHUNK, bytes.length));
          const len = Buffer.alloc(4);
          len.writeUInt32BE(slice.length, 0);
          socket.write(len);
          socket.write(slice);
        }
        const terminator = Buffer.alloc(4);
        terminator.writeUInt32BE(0, 0);
        socket.write(terminator);
      });
      socket.on('data', (d) => chunks.push(d));
      socket.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
  }
}

// ── clamscan one-shot provider (no daemon) ────────────────────────────────

class ClamscanScanProvider implements ScanProvider {
  readonly name = 'clamav-clamscan';

  constructor(
    private readonly binary: string,
    private readonly fetchBytes: ObjectByteFetcher,
  ) {}

  async scan(objectPath: string): Promise<ScanResult> {
    let bytes: Buffer;
    try {
      bytes = await this.fetchBytes(objectPath);
    } catch (err) {
      return { verdict: 'error', engineVersion: 'unknown', detail: `fetch failed: ${String(err)}` };
    }
    let dir: string | undefined;
    try {
      dir = await mkdtemp(join(tmpdir(), 'prism-scan-'));
      const file = join(dir, 'object.bin');
      await writeFile(file, bytes);
      return await this.runClamscan(file);
    } catch (err) {
      return { verdict: 'error', engineVersion: 'clamav', detail: `clamscan error: ${String(err)}` };
    } finally {
      if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private runClamscan(file: string): Promise<ScanResult> {
    return new Promise((resolve) => {
      const proc = spawn(this.binary, ['--no-summary', '--stdout', file]);
      let stdout = '';
      proc.stdout.on('data', (d) => (stdout += d.toString()));
      proc.on('error', (err) =>
        resolve({ verdict: 'error', engineVersion: 'clamav', detail: String(err) }),
      );
      // clamscan exit: 0 = clean, 1 = infected, 2+ = error
      proc.on('close', (code) => {
        if (code === 0) resolve({ verdict: 'clean', engineVersion: 'clamav', detail: stdout.trim() });
        else if (code === 1) resolve(parseClamReply(stdout, 'clamav'));
        else resolve({ verdict: 'error', engineVersion: 'clamav', detail: stdout.trim() || `exit ${code}` });
      });
    });
  }
}

// ── Managed AV REST API provider ──────────────────────────────────────────

class ApiScanProvider implements ScanProvider {
  readonly name = 'clamav-api';

  constructor(
    private readonly url: string,
    private readonly apiKey: string,
    private readonly fetchBytes: ObjectByteFetcher,
  ) {}

  async scan(objectPath: string): Promise<ScanResult> {
    if (!this.url) {
      return { verdict: 'error', engineVersion: 'unknown', detail: 'PRISM_SCAN_API_URL not set' };
    }
    let bytes: Buffer;
    try {
      bytes = await this.fetchBytes(objectPath);
    } catch (err) {
      return { verdict: 'error', engineVersion: 'unknown', detail: `fetch failed: ${String(err)}` };
    }
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: new Uint8Array(bytes),
      });
      if (!res.ok) {
        return { verdict: 'error', engineVersion: 'api', detail: `HTTP ${res.status}` };
      }
      const body = (await res.json()) as { status?: string; verdict?: string; engine?: string };
      const raw = (body.verdict ?? body.status ?? '').toLowerCase();
      const verdict = raw.includes('infect') || raw.includes('malicious')
        ? 'infected'
        : raw.includes('clean') || raw.includes('ok') || raw === 'no_threats_found'
          ? 'clean'
          : 'error';
      return { verdict, engineVersion: body.engine ?? 'api', detail: JSON.stringify(body) };
    } catch (err) {
      return { verdict: 'error', engineVersion: 'api', detail: `api error: ${String(err)}` };
    }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────

/**
 * Build the configured ScanProvider. The provider is given a byte-fetcher so
 * it can read the quarantined object without knowing about Supabase storage.
 */
export function createScanProvider(fetchBytes: ObjectByteFetcher): ScanProvider {
  const mode = (process.env.PRISM_SCAN_PROVIDER ?? 'clamd').toLowerCase();
  switch (mode) {
    case 'clamd':
      return new ClamdScanProvider(
        process.env.PRISM_CLAMD_HOST ?? '127.0.0.1',
        Number(process.env.PRISM_CLAMD_PORT ?? 3310),
        fetchBytes,
      );
    case 'clamscan':
      return new ClamscanScanProvider(process.env.PRISM_CLAMSCAN_BIN ?? 'clamscan', fetchBytes);
    case 'api':
      return new ApiScanProvider(
        process.env.PRISM_SCAN_API_URL ?? '',
        process.env.PRISM_SCAN_API_KEY ?? '',
        fetchBytes,
      );
    default:
      throw new Error(`Unknown PRISM_SCAN_PROVIDER: ${mode}`);
  }
}
