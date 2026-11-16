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
  private offset: number;

  /** `offsetSeconds` (HP6, STANDIN_CLOCK_OFFSET) starts a following clock that far ahead of real time (or behind, when negative). */
  constructor(start?: Date, offsetSeconds = 0) {
    super();
    this.frozenAt = start ? start.getTime() : null;
    this.offset = offsetSeconds * 1000;
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
