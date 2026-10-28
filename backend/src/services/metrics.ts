import http from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

/**
 * Minimal in-process metrics in the Prometheus text format, so any Prometheus,
 * Grafana Agent or uptime checker can scrape /api/v1/metrics. No dependency,
 * no external service; each process (API, worker) reports its own counters.
 */
type Labels = Record<string, string>;
const counters = new Map<string, Map<string, number>>();
const help: Record<string, string> = {
  cyberlearn_http_requests_total: 'HTTP requests by method, route and status class',
  cyberlearn_http_request_seconds_sum: 'Total time spent answering HTTP requests',
  cyberlearn_http_request_seconds_count: 'HTTP requests timed',
  cyberlearn_http_slow_requests_total: 'HTTP requests slower than 2 seconds',
  cyberlearn_ai_calls_total: 'Structured AI calls by provider and outcome',
  cyberlearn_ai_seconds_sum: 'Total time spent waiting for AI providers',
  cyberlearn_generations_total: 'Finished lesson generations by final status',
};

const key = (labels: Labels) =>
  Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v.replace(/["\\\n]/g, '_')}"`)
    .join(',');

export function inc(name: string, labels: Labels = {}, by = 1) {
  const series = counters.get(name) ?? new Map<string, number>();
  const k = key(labels);
  series.set(k, (series.get(k) ?? 0) + by);
  counters.set(name, series);
}

export function render(): string {
  const lines: string[] = [];
  const mem = process.memoryUsage();
  const gauges: [string, number, string][] = [
    ['cyberlearn_process_uptime_seconds', Math.round(process.uptime()), 'Process uptime'],
    ['cyberlearn_process_resident_bytes', mem.rss, 'Resident memory'],
    ['cyberlearn_process_heap_used_bytes', mem.heapUsed, 'V8 heap in use'],
  ];
  for (const [name, value, text] of gauges) lines.push(`# HELP ${name} ${text}`, `# TYPE ${name} gauge`, `${name} ${value}`);
  for (const [name, series] of counters) {
    lines.push(`# HELP ${name} ${help[name] ?? name}`, `# TYPE ${name} counter`);
    for (const [labels, value] of series) lines.push(`${name}${labels ? `{${labels}}` : ''} ${Number(value.toFixed(3))}`);
  }
  return `${lines.join('\n')}\n`;
}

/** Counts every API request by its route pattern (never the raw URL, which contains ids). */
export function httpMetrics(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : 'unmatched';
    inc('cyberlearn_http_requests_total', { method: req.method, route, status: `${String(res.statusCode)[0]}xx` });
    inc('cyberlearn_http_request_seconds_sum', {}, seconds);
    inc('cyberlearn_http_request_seconds_count');
    if (seconds > 2) inc('cyberlearn_http_slow_requests_total', { route });
  });
  next();
}

/** Metrics are off unless METRICS_TOKEN is set; scrapers send it as a bearer token. */
export function metricsAuthorized(header: string | undefined) {
  return Boolean(env.METRICS_TOKEN) && header === `Bearer ${env.METRICS_TOKEN}`;
}

export function metricsHandler(req: Request, res: Response) {
  if (!metricsAuthorized(req.headers.authorization)) {
    res.status(404).end();
    return;
  }
  res.type('text/plain; version=0.0.4').send(render());
}

/** The standalone worker has no HTTP API; it can expose its own counters on METRICS_PORT. */
export function startMetricsServer(port: number) {
  const server = http.createServer((req, res) => {
    if (req.url !== '/metrics' || !metricsAuthorized(req.headers.authorization)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' }).end(render());
  });
  server.listen(port);
  return server;
}
