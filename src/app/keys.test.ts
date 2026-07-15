import { describe, it, expect } from 'vitest';
import { routeGlobalKey, type ViewId } from './keys.js';
const ids: ViewId[] = ['home', 'events', 'schedule', 'docs', 'status', 'links', 'settings'];

describe('routeGlobalKey', () => {
  it('q and ctrl-c quit', () => {
    expect(routeGlobalKey('q', ids, 'home')).toEqual({ quit: true, handled: true });
    expect(routeGlobalKey('\x03', ids, 'events')).toEqual({ quit: true, handled: true });
  });
  it('esc quits at home, backs elsewhere', () => {
    expect(routeGlobalKey('\x1b', ids, 'home')).toEqual({ quit: true, handled: true });
    expect(routeGlobalKey('\x1b', ids, 'events')).toEqual({ back: true, handled: true });
  });
  it('digit selects the view by 1-based index', () => {
    expect(routeGlobalKey('2', ids, 'home')).toEqual({ switchTo: 'events', handled: true });
    expect(routeGlobalKey('9', ids, 'home')).toEqual({ handled: false }); // out of range
  });
  it('tab cycles to the next view', () => {
    expect(routeGlobalKey('\t', ids, 'settings')).toEqual({ switchTo: 'home', handled: true });
  });
  it('other keys are not handled (delegated to the view)', () => {
    expect(routeGlobalKey('j', ids, 'events')).toEqual({ handled: false });
  });
  it('PageUp/PageDown scroll the body by one page', () => {
    expect(routeGlobalKey('\x1b[5~', ids, 'events')).toEqual({ scrollBy: -1, handled: true });
    expect(routeGlobalKey('\x1b[6~', ids, 'events')).toEqual({ scrollBy: 1, handled: true });
  });
});
