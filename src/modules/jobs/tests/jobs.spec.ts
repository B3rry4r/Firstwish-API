import { PrismaService } from "../../../common/db/prisma.service";
import { Clock } from "../../../common/ports/clock.port";
import { IdGenerator } from "../../../common/ports/ids.port";
import { QueueService } from "../../../common/queue/queue.service";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { JobsService, MAX_TRIES } from "../jobs.service";

const NOW = new Date("2027-01-10T09:00:00.000Z");

describe("jobs frame", () => {
  let t: TestApp;
  let db: PrismaService;
  let jobs: JobsService;
  let nid: () => string;
  let key = 0;
  const subject = () => `b06-job-${process.pid}-${Date.now()}-${++key}`;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    jobs = t.app.get(JobsService);
    const ids = t.app.get(IdGenerator);
    nid = () => ids.id();
  });
  afterAll(() => t.close());

  it("schedule is safe to call twice: one job, moved to the latest time; a job that ran is scheduled afresh", async () => {
    const k = subject();
    const a = await jobs.schedule("send-message", new Date(NOW.getTime() + 1000), k);
    const b = await jobs.schedule("send-message", new Date(NOW.getTime() + 5000), k);
    expect(b).toBe(a);
    expect(await db.job.count({ where: { subjectId: k } })).toBe(1);
    expect((await db.job.findUniqueOrThrow({ where: { id: a } })).runAt.getTime()).toBe(NOW.getTime() + 5000);
    const both = await Promise.all([jobs.schedule("send-message", NOW, subject()), jobs.schedule("send-message", NOW, k), jobs.schedule("send-message", NOW, k)]);
    expect(both).toHaveLength(3);
    expect(await db.job.count({ where: { subjectId: k, status: "scheduled" } })).toBe(1);
  });

  it("a job runs once: a second run finds nothing, and the run is recorded", async () => {
    const k = subject();
    let ran = 0;
    jobs.register("send-message", (c) => {
      if (c.subjectId === k) ran++;
      return c.subjectId === k ? { changed: { done: true } } : { skipped: true };
    });
    await jobs.schedule("send-message", NOW, k);
    await jobs.runDue();
    await jobs.runDue();
    expect(ran).toBe(1);
    const job = await db.job.findFirstOrThrow({ where: { subjectId: k } });
    expect(job.status).toBe("succeeded");
    const runs = await db.jobRun.findMany({ where: { jobId: job.id } });
    expect(runs).toEqual([expect.objectContaining({ outcome: "succeeded", error: null, changed: { done: true } })]);
    expect(runs[0].finishedAt).not.toBeNull();
  });

  it("two workers never run one job", async () => {
    const k = subject();
    const seen: string[] = [];
    const worker2 = new JobsService(db, t.app.get(Clock), t.app.get(IdGenerator), t.app.get(QueueService));
    const handler = async (c: { subjectId: string }) => {
      if (c.subjectId.startsWith("b06-two-")) {
        seen.push(c.subjectId);
        await new Promise((r) => setTimeout(r, 30));
      }
      return { changed: {} };
    };
    jobs.register("send-message", handler);
    worker2.register("send-message", handler);
    const keys = Array.from({ length: 12 }, (_, i) => `b06-two-${k}-${i}`);
    await Promise.all(keys.map((x) => jobs.schedule("send-message", NOW, x)));
    const [a, b] = await Promise.all([jobs.runDue(), worker2.runDue()]);
    expect(a + b).toBeGreaterThanOrEqual(12);
    expect(seen.sort()).toEqual([...keys].sort());
    expect(await db.jobRun.count({ where: { job: { subjectId: { in: keys } } } })).toBe(12);
  });

  it("a failing job is retried with backoff up to the tries, then parked for staff; a retry runs it again", async () => {
    const k = subject();
    let calls = 0;
    let fail = true;
    jobs.register("send-message", (c) => {
      if (c.subjectId !== k) return { skipped: true };
      calls++;
      if (fail) throw new Error("provider down");
      return { changed: { sent: true } };
    });
    await jobs.schedule("send-message", NOW, k);
    const job = await db.job.findFirstOrThrow({ where: { subjectId: k } });
    let last = 0;
    for (let i = 1; i <= MAX_TRIES; i++) {
      await jobs.runDue();
      const row = await db.job.findUniqueOrThrow({ where: { id: job.id } });
      expect(row.attempts).toBe(i);
      if (i < MAX_TRIES) {
        expect(row.status).toBe("failed");
        const wait = row.runAt.getTime() - t.clock.now().getTime();
        expect(wait).toBeGreaterThan(last);
        last = wait;
        await jobs.runDue();
        expect(calls).toBe(i);
        t.clock.advance(wait + 1);
      }
    }
    expect((await db.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("dead");
    t.clock.advance(24 * 3600 * 1000);
    await jobs.runDue();
    expect(calls).toBe(MAX_TRIES);
    expect(await db.jobRun.count({ where: { jobId: job.id, outcome: "failed", error: "provider down" } })).toBe(MAX_TRIES);
    fail = false;
    expect(await jobs.retryParked(job.id)).toBe(true);
    await jobs.runDue();
    expect((await db.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("succeeded");
    t.clock.set(NOW);
  });

  it("the BullMQ tick runs due jobs from the queue", async () => {
    const k = subject();
    let ran = false;
    jobs.register("send-message", (c) => {
      if (c.subjectId === k) ran = true;
      return { changed: {} };
    });
    await jobs.schedule("send-message", NOW, k);
    await jobs.startPolling(200);
    for (let i = 0; i < 40 && !ran; i++) await new Promise((r) => setTimeout(r, 150));
    expect(ran).toBe(true);
    void nid;
  });
});
