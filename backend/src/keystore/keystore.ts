import { Redis } from "ioredis";

import { Redlock, Settings } from "@app/lib/red-lock";

export type TKeyStoreFactory = ReturnType<typeof keyStoreFactory>;

// all the key prefixes used must be set here to avoid conflict
export enum KeyStorePrefixes {
  SecretReplication = "secret-replication-import-lock"
}

type TWaitTillReady = {
  key: string;
  waitingCb?: () => void;
  keyCheckCb: (val: string | null) => boolean;
  waitIteration?: number;
  delay?: number;
  jitter?: number;
};

export const keyStoreFactory = (redisUrl: string) => {
  const redis = new Redis(redisUrl);
  const redisLock = new Redlock([redis], { retryCount: 2, retryDelay: 200 });

  const setItem = async (key: string, value: string | number | Buffer, prefix?: string) =>
    redis.set(prefix ? `${prefix}:${key}` : key, value);

  const getItem = async (key: string, prefix?: string) => redis.get(prefix ? `${prefix}:${key}` : key);

  const setItemWithExpiry = async (
    key: string,
    exp: number | string,
    value: string | number | Buffer,
    prefix?: string
  ) => redis.setex(prefix ? `${prefix}:${key}` : key, exp, value);

  const deleteItem = async (key: string) => redis.del(key);

  const incrementBy = async (key: string, value: number) => redis.incrby(key, value);

  const waitTillReady = async ({
    key,
    waitingCb,
    keyCheckCb,
    waitIteration = 10,
    delay = 1000,
    jitter = 200
  }: TWaitTillReady) => {
    let attempts = 0;
    let isReady = keyCheckCb(await getItem(key));
    while (!isReady) {
      if (attempts > waitIteration) return;
      // eslint-disable-next-line
      await new Promise((resolve) => {
        waitingCb?.();
        setTimeout(resolve, Math.max(0, delay + Math.floor((Math.random() * 2 - 1) * jitter)));
      });
      attempts += 1;
      // eslint-disable-next-line
      isReady = keyCheckCb(await getItem(key, "wait_till_ready"));
    }
  };

  return {
    setItem,
    getItem,
    setItemWithExpiry,
    deleteItem,
    incrementBy,
    acquireLock(resources: string[], duration: number, settings?: Partial<Settings>) {
      return redisLock.acquire(resources, duration, settings);
    },
    waitTillReady
  };
};
