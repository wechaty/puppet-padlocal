import { PromiseCallback } from "./PromiseCallback";
import { SerialJob, SerialJobFunc } from "./SerialJob";

export class SerialExecutor {
  private _jobs: SerialJob[];
  private _executing: boolean;

  constructor() {
    this._jobs = [];
    this._executing = false;
  }

  execute<T>(jobFunc: SerialJobFunc, type?: string): Promise<T> {
    return new Promise((resolve, reject) => {
      this._jobs.push(new SerialJob(jobFunc, new PromiseCallback(resolve, reject), type));

      this._executeNextJob();
    });
  }

  /**
   * @param type: if type is undefined, clear all jobs in queue
   */
  clear(type?: string) {
    this._jobs = this._jobs.filter((job: SerialJob) => {
      if (!type) {
        return false;
      } else {
        return job.type !== type;
      }
    });
  }

  private _executeNextJob() {
    if (this._executing) {
      return;
    }

    const job = this._jobs.shift();
    if (!job) {
      return;
    }

    this._executing = true;

    job
      .func()
      .then((res) => {
        job.promiseCallback.resolve(res);
      })
      .catch((e) => {
        job.promiseCallback.reject(e);
      })
      .finally(() => {
        this._executing = false;

        this._executeNextJob();
      });
  }
}
