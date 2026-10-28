import { describe, expect, it } from 'vitest';
import { parseFallbackModels, pickFreeModels, visibleModels } from './AiProviderCard';

describe('fallback model helpers', () => {
  it('parses one model per line, dropping blanks, duplicates and the main model', () => {
    expect(parseFallbackModels('a:free\n\n b:free \na:free\nmain\nc, d', 'main')).toEqual(['a:free', 'b:free', 'c', 'd']);
    expect(parseFallbackModels('1\n2\n3\n4\n5\n6', 'main')).toHaveLength(5);
  });

  it('suggests only free models that are not already chosen', () => {
    const available = ['paid/x', 'v/a:free', 'v/b:free', 'v/c:free', 'v/d:free'];
    expect(pickFreeModels(available, ['v/a:free'], 'v/b:free')).toEqual(['v/c:free', 'v/d:free']);
  });

  it('lists free models only, or free models first', () => {
    const all = ['a/paid', 'b/x:free', 'c/paid', 'd/y:free'];
    expect(visibleModels(all, true)).toEqual(['b/x:free', 'd/y:free']);
    expect(visibleModels(all, false)).toEqual(['b/x:free', 'd/y:free', 'a/paid', 'c/paid']);
  });

  it('never suggests or prefers non-chat models such as safety classifiers', () => {
    const all = ['n/content-safety:free', 'g/gemma:free', 'm/llama-guard:free'];
    expect(pickFreeModels(all, [], '')).toEqual(['g/gemma:free']);
    expect(visibleModels(all, true)[0]).toBe('g/gemma:free');
  });
});
