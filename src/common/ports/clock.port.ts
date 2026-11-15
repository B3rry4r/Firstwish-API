/** The time source. Inject Clock instead of calling Date.now(), so tests can move time. */
export abstract class Clock {
  abstract now(): Date;
}

export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}

/**
 * Stand-in clock. Given a start it is frozen there; without one it follows real time.
 * Either way set() and advance() move it.
 */
export class StandinClock extends Clock {
  private frozenAt: number | null;
  private offset = 0;

  constructor(start?: Date) {
    super();
    this.frozenAt = start ? start.getTime() : null;
  }
  now(): Date {
    return new Date(this.frozenAt ?? Date.now() + this.offset);
  }
  set(at: Date): void {
    if (this.frozenAt !== null) this.frozenAt = at.getTime();
    else this.offset = at.getTime() - Date.now();
  }
  advance(ms: number): void {
    if (this.frozenAt !== null) this.frozenAt += ms;
    else this.offset += ms;
  }
}
