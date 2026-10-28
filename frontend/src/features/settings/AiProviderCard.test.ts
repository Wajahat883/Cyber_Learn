import { describe, expect, it } from 'vitest';
import { parseFallbackModels, pickFreeModels } from './AiProviderCard';

describe('fallback model helpers', () => {
  it('parses one model per line, dropping blanks, duplicates and the main model', () => {
    expect(parseFallbackModels('a:free\n\n b:free \na:free\nmain\nc, d', 'main')).toEqual(['a:free', 'b:free', 'c', 'd']);
    expect(parseFallbackModels('1\n2\n3\n4\n5\n6', 'main')).toHaveLength(5);
  });

  it('suggests only free models that are not already chosen', () => {
    const available = ['paid/x', 'v/a:free', 'v/b:free', 'v/c:free', 'v/d:free'];
    expect(pickFreeModels(available, ['v/a:free'], 'v/b:free')).toEqual(['v/c:free', 'v/d:free']);
  });
});
