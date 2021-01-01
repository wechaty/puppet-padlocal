export type PromiseResolveFunc = (val: any) => void;
export type PromiseRejectFunc = (error: Error) => void;

export class PromiseCallback {
  private readonly _resolve: PromiseResolveFunc;
  private readonly _reject: PromiseRejectFunc;
  private _timeoutId?: NodeJS.Timeout;

  constructor(resolve: PromiseResolveFunc, reject: PromiseRejectFunc, timeoutId?: NodeJS.Timeout) {
    this._resolve = resolve;
    this._reject = reject;
    this._timeoutId = timeoutId;
  }

  resolve(val?: any): void {
    this._resolve(val);
    this._invalidateTimeout();
  }

  reject(error: Error): void {
    this._reject(error);
    this._invalidateTimeout();
  }

  private _invalidateTimeout() {
    if (this._timeoutId === undefined) {
      return;
    }

    clearTimeout(this._timeoutId);
    this._timeoutId = undefined;
  }
}
