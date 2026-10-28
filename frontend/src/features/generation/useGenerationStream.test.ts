import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useGenerationStream } from './useGenerationStream';

/** Minimal EventSource stand-in that tests drive by hand. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, ((e: Event) => void)[]>();
  closed = false;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: Event) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data?: unknown) {
    const event = data === undefined ? new Event(type) : new MessageEvent(type, { data: JSON.stringify(data) });
    for (const fn of this.listeners.get(type) ?? []) fn(event);
  }
}

const last = () => FakeEventSource.instances[FakeEventSource.instances.length - 1];

describe('useGenerationStream', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('tracks connection state and progress events', () => {
    const { result } = renderHook(() => useGenerationStream('g1', true));
    expect(last().url).toBe('/api/v1/generations/g1/events');
    act(() => last().emit('open'));
    expect(result.current.connected).toBe(true);
    act(() => last().emit('progress', { status: 'running', stageResults: [] }));
    expect(result.current.event?.status).toBe('running');
    act(() => last().emit('error'));
    expect(result.current.connected).toBe(false);
  });

  it('closes the stream when the run reaches a terminal status', () => {
    const { result } = renderHook(() => useGenerationStream('g1', true));
    act(() => last().emit('open'));
    act(() => last().emit('progress', { status: 'failed', stageResults: [] }));
    expect(last().closed).toBe(true);
    expect(result.current.connected).toBe(false);
    expect(result.current.event?.status).toBe('failed');
  });

  it('does not keep a stale event from a previous run after a retry (regression)', () => {
    const { result, rerender } = renderHook(({ enabled }) => useGenerationStream('g1', enabled), { initialProps: { enabled: true } });
    act(() => last().emit('progress', { status: 'failed', stageResults: [] }));
    expect(result.current.event?.status).toBe('failed');

    // The page disables the stream for terminal runs, then re-enables it when a retry starts.
    rerender({ enabled: false });
    rerender({ enabled: true });
    expect(result.current.event).toBeNull();
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(last().closed).toBe(false);
  });

  it('starts fresh when switching to another generation', () => {
    const { result, rerender } = renderHook(({ id }) => useGenerationStream(id, true), { initialProps: { id: 'g1' } });
    const first = last();
    act(() => first.emit('progress', { status: 'running', stageResults: [] }));
    rerender({ id: 'g2' });
    expect(first.closed).toBe(true);
    expect(result.current.event).toBeNull();
    expect(last().url).toContain('/g2/');
  });

  it('ignores malformed events', () => {
    const { result } = renderHook(() => useGenerationStream('g1', true));
    act(() => {
      for (const fn of last().listeners.get('progress') ?? []) fn(new MessageEvent('progress', { data: '{not json' }));
    });
    expect(result.current.event).toBeNull();
  });
});
