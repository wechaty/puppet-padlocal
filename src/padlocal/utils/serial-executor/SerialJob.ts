import type { PromiseCallback } from "./PromiseCallback";

export type SerialJobFunc = () => Promise<any>;

export class SerialJob {

  readonly type: string | undefined;
  readonly func: SerialJobFunc;
  readonly promiseCallback: PromiseCallback;

  constructor(func: SerialJobFunc, promiseCallback: PromiseCallback, type?: string) {
    this.func = func;
    this.promiseCallback = promiseCallback;
    this.type = type;
  }

}
