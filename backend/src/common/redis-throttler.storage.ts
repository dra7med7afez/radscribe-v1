import { ThrottlerStorage } from "@nestjs/throttler";
import { createClient, type RedisClientType } from "redis";

const INCREMENT_SCRIPT = `
local blockedTtl = redis.call('PTTL', KEYS[2])
if blockedTtl > 0 then
  local current = tonumber(redis.call('GET', KEYS[1]) or '0')
  return {current, math.max(redis.call('PTTL', KEYS[1]), 0), 1, blockedTtl}
end
local total = redis.call('INCR', KEYS[1])
if total == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = math.max(redis.call('PTTL', KEYS[1]), 0)
if total > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return {total, ttl, 1, tonumber(ARGV[3])}
end
return {total, ttl, 0, 0}
`;

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

export class RedisThrottlerStorage implements ThrottlerStorage {
  private client: RedisClientType;
  private connecting?: Promise<unknown>;

  constructor(url: string) {
    this.client = createClient({ url });
    this.client.on("error", () => undefined);
  }

  private async ready() {
    if (this.client.isReady) return;
    this.connecting ??= this.client.connect().finally(() => {
      this.connecting = undefined;
    });
    await this.connecting;
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string
  ): Promise<ThrottlerStorageRecord> {
    await this.ready();
    const prefix = `throttle:${throttlerName}:${key}`;
    const result = (await this.client.eval(INCREMENT_SCRIPT, {
      keys: [`${prefix}:count`, `${prefix}:blocked`],
      arguments: [
        String(ttl),
        String(limit),
        String(blockDuration > 0 ? blockDuration : ttl),
      ],
    })) as number[];
    return {
      totalHits: Number(result[0]),
      timeToExpire: Number(result[1]),
      isBlocked: Number(result[2]) === 1,
      timeToBlockExpire: Number(result[3]),
    };
  }

  async ping() {
    await this.ready();
    return this.client.ping();
  }
}

export const redisThrottleStorage = process.env.REDIS_URL
  ? new RedisThrottlerStorage(process.env.REDIS_URL)
  : null;
