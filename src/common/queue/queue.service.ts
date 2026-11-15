import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Processor, Queue, Worker } from "bullmq";
import { RedisService } from "./redis.service";

/**
 * BullMQ queues and workers for timed work. Every job runs from the queue with a recorded run, never because a page is open.
 * Queue names are kebab-case; keys are prefixed per database.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];

  constructor(private readonly redis: RedisService) {}

  queue(name: string): Queue {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, { connection: this.redis.bullConnection(), prefix: this.redis.prefix });
      this.queues.set(name, q);
    }
    return q;
  }

  worker(name: string, processor: Processor, concurrency = 1): Worker {
    const w = new Worker(name, processor, { connection: this.redis.bullConnection(), prefix: this.redis.prefix, concurrency });
    this.workers.push(w);
    return w;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.workers.map((w) => w.close()), ...[...this.queues.values()].map((q) => q.close())]);
  }
}
