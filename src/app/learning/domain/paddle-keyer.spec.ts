import { PaddleKeyer } from './paddle-keyer';

describe('paddle keyer', () => {
  it('repeats held contacts and alternates a squeeze', () => {
    const keyer = new PaddleKeyer();
    keyer.dit = true;
    expect(keyer.next()).toBe('.');
    expect(keyer.next()).toBe('.');
    keyer.dah = true;
    expect(keyer.next()).toBe('-');
    expect(keyer.next()).toBe('.');
    keyer.dit = false;
    expect(keyer.next()).toBe('-');
    keyer.reset();
    expect(keyer.next()).toBeNull();
  });
});
