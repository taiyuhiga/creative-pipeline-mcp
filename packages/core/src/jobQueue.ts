export interface Job<T> {
  id: string;
  description: string;
  run(): Promise<T>;
}

export class JobQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private counter = 0;

  nextId(prefix = "job"): string {
    this.counter += 1;
    return `${prefix}-${Date.now()}-${this.counter}`;
  }

  enqueue<T>(job: Job<T>): Promise<T> {
    const task = this.tail.then(() => job.run());
    this.tail = task.catch(() => undefined);
    return task;
  }
}

