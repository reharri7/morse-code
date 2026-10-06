export type PaddleElement = '.' | '-';

/** Iambic A: held contacts repeat; a squeeze alternates; release finishes the current element. */
export class PaddleKeyer {
  dit = false;
  dah = false;
  private last: PaddleElement = '-';

  next(): PaddleElement | null {
    const element = this.dit && this.dah ? (this.last === '.' ? '-' : '.')
      : this.dit ? '.' : this.dah ? '-' : null;
    if (element) this.last = element;
    return element;
  }

  reset(): void { this.dit = false; this.dah = false; this.last = '-'; }
}
