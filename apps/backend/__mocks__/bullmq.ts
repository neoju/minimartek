// Stub for bullmq — prevents ioredis from connecting to Redis during tests
export class Queue {
  constructor(_name: string, _opts?: unknown) {}
  async add(_name: string, _data: unknown, _opts?: unknown) {
    return { id: "stub-job" };
  }
  async addBulk(_jobs: unknown[]) {
    return [];
  }
  async remove(_jobId: string) {}
  on() {
    return this;
  }
  async close() {}
}

export class Worker {
  constructor(_name: string, _fn: unknown, _opts?: unknown) {}
  on() {
    return this;
  }
  async close() {}
}

export type ConnectionOptions = Record<string, unknown>;
