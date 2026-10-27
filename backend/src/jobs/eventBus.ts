import { EventEmitter } from 'node:events';
import type { Redis } from 'ioredis';
import type { GenerationEvent } from '@cyberlearn/shared';
import { createRedis, useRedis } from '../config/redis.js';
import { logger } from '../utils/logger.js';

/**
 * Generation progress fan-out. The worker publishes; every API instance
 * relays events to its open SSE connections. Uses Redis pub/sub when available
 * so the worker can run in a separate container.
 */
const local = new EventEmitter();
local.setMaxListeners(0);

let publisher: Redis | undefined;
let subscriber: Redis | undefined;
const CHANNEL = 'cyberlearn:generation-events';

function ensureSubscriber() {
  if (!useRedis || subscriber) return;
  subscriber = createRedis('events-sub');
  subscriber.subscribe(CHANNEL).catch((err) => logger.error({ err }, 'Failed to subscribe to generation events'));
  subscriber.on('message', (_channel, message) => {
    try {
      const event = JSON.parse(message) as GenerationEvent;
      local.emit(event.generationId, event);
    } catch {
      /* ignore malformed messages */
    }
  });
}

export async function publishGenerationEvent(event: GenerationEvent) {
  if (useRedis) {
    publisher ??= createRedis('events-pub');
    await publisher.publish(CHANNEL, JSON.stringify(event)).catch((err) => logger.warn({ err }, 'Failed to publish generation event'));
  } else {
    local.emit(event.generationId, event);
  }
}

export function subscribeGeneration(generationId: string, listener: (event: GenerationEvent) => void): () => void {
  ensureSubscriber();
  local.on(generationId, listener);
  return () => local.off(generationId, listener);
}

export async function closeEventBus() {
  await Promise.all([publisher?.quit(), subscriber?.quit()].filter(Boolean));
  publisher = subscriber = undefined;
}
