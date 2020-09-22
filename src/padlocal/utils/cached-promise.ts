const PromiseCache = new Map<string, Promise<any>>();

export async function CachedPromise<T>(key: string, promise: Promise<T>): Promise<T> {
  const cache = PromiseCache.get(key);
  if (cache) {
    return cache;
  }

  PromiseCache.set(key, promise);
  promise.finally(() => PromiseCache.delete(key));

  return promise;
}

type PromiseFunc<T> = () => Promise<T>;

export async function CachedPromiseFunc<T>(key: string, promiseFunc: PromiseFunc<T>): Promise<T> {
  const cache = PromiseCache.get(key);
  if (cache) {
    return cache;
  }

  const promise = promiseFunc();

  PromiseCache.set(key, promise);
  promise.finally(() => PromiseCache.delete(key));

  return promise;
}
