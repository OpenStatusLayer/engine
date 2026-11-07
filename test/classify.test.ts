import { describe, it, expect } from 'vitest';
import { classifyHttp, classifyTcp } from '../src/checks/classify.js';

describe('classifyHttp', () => {
  it('operational for fast 2xx', () => expect(classifyHttp(200, 50, 1000)).toBe('operational'));
  it('operational at boundary just under threshold', () =>
    expect(classifyHttp(204, 999, 1000)).toBe('operational'));
  it('degraded for slow 2xx (>= threshold)', () =>
    expect(classifyHttp(200, 1000, 1000)).toBe('degraded'));
  it('down for 5xx', () => expect(classifyHttp(503, 20, 1000)).toBe('down'));
  it('down for 4xx', () => expect(classifyHttp(404, 20, 1000)).toBe('down'));
  it('down for 3xx (redirects not followed)', () => expect(classifyHttp(301, 20, 1000)).toBe('down'));
  it('down when no response', () => expect(classifyHttp(null, 5000, 1000)).toBe('down'));
});

describe('classifyTcp', () => {
  it('operational for fast connect', () => expect(classifyTcp(true, 10, 1000)).toBe('operational'));
  it('degraded for slow connect', () => expect(classifyTcp(true, 1500, 1000)).toBe('degraded'));
  it('down when not connected', () => expect(classifyTcp(false, 0, 1000)).toBe('down'));
});
