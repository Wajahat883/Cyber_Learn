import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LessonSection } from '@cyberlearn/shared';
import { useLessonAutosave } from './useLessonAutosave';

const section = (title: string) =>
  ({ id: 's1', title, keyConcepts: [], commonMistakes: [], prerequisites: [], warnings: [], codeSnippets: [] }) as unknown as LessonSection;

function setup() {
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, wrapper };
}

/** fetch mock whose responses the test resolves in any order. */
function deferredFetch() {
  const calls: { body: { sections: LessonSection[] }; resolve: (title: string) => void }[] = [];
  const mock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).endsWith('/auth/csrf')) return new Response(null, { status: 204 });
    const body = JSON.parse(String(init!.body));
    return new Promise<Response>((resolve) => {
      calls.push({
        body,
        resolve: (title) => resolve(new Response(JSON.stringify({ lesson: { _id: 'L1', title } }), { status: 200, headers: { 'content-type': 'application/json' } })),
      });
    });
  });
  return { mock, calls };
}

describe('useLessonAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.cookie = 'cl_csrf=t; path=/';
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('debounces edits into a single save', async () => {
    const { mock, calls } = deferredFetch();
    vi.stubGlobal('fetch', mock);
    const { wrapper, qc } = setup();
    const { result } = renderHook(() => useLessonAutosave('L1', 1500), { wrapper });
    act(() => result.current.schedule([section('a')]));
    act(() => result.current.schedule([section('ab')]));
    await act(async () => vi.advanceTimersByTimeAsync(1500));
    expect(calls).toHaveLength(1);
    expect(calls[0].body.sections[0].title).toBe('ab');
    await act(async () => calls[0].resolve('ab'));
    expect(result.current.saveState).toBe('saved');
    expect(qc.getQueryData<{ title: string }>(['lesson', 'L1'])?.title).toBe('ab');
  });

  it('flushes a pending edit on unmount instead of dropping it', async () => {
    const { mock, calls } = deferredFetch();
    vi.stubGlobal('fetch', mock);
    const { wrapper } = setup();
    const { result, unmount } = renderHook(() => useLessonAutosave('L1', 1500), { wrapper });
    act(() => result.current.schedule([section('last words')]));
    unmount();
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(calls).toHaveLength(1);
    expect(calls[0].body.sections[0].title).toBe('last words');
    // The debounce timer must not fire a second save later.
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(calls).toHaveLength(1);
  });

  it('ignores an older response that arrives after a newer one', async () => {
    const { mock, calls } = deferredFetch();
    vi.stubGlobal('fetch', mock);
    const { wrapper, qc } = setup();
    const { result } = renderHook(() => useLessonAutosave('L1', 1500), { wrapper });
    act(() => void result.current.saveNow([section('old')]));
    act(() => void result.current.saveNow([section('new')]));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(calls).toHaveLength(2);
    await act(async () => calls[1].resolve('new'));
    await act(async () => calls[0].resolve('old'));
    expect(qc.getQueryData<{ title: string }>(['lesson', 'L1'])?.title).toBe('new');
    expect(result.current.saveState).toBe('saved');
  });

  it('asks before unloading the page while an edit is unsaved', async () => {
    const { mock, calls } = deferredFetch();
    vi.stubGlobal('fetch', mock);
    const { wrapper } = setup();
    const { result } = renderHook(() => useLessonAutosave('L1', 1500), { wrapper });
    const fire = () => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(fire()).toBe(false);
    act(() => result.current.schedule([section('x')]));
    expect(fire()).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(1500));
    expect(fire()).toBe(true); // still in flight
    await act(async () => calls[0].resolve('x'));
    expect(fire()).toBe(false);
  });
});
