const PromiseCache = new Map<string, Promise<any>>();

export async function CachedPromise<T>(key: string, promise: Promise<T>): Promise<T> {
  const cache = PromiseCache.get(key);
  if (cache) {
    return cache;
  }

  PromiseCache.set(key, promise);
  return promise.finally(() => PromiseCache.delete(key));
}

type PromiseFunc<T> = () => Promise<T>;

export async function CachedPromiseFunc<T>(key: string, promiseFunc: PromiseFunc<T>): Promise<T> {
  const cache = PromiseCache.get(key);
  if (cache) {
    return cache;
  }

  const promise = promiseFunc();

  PromiseCache.set(key, promise);
  return promise.finally(() => PromiseCache.delete(key));
}
