import { describe, expect, it } from 'vitest';
import { renderTemplate } from '../src/providers/template.js';

describe('template renderer', () => {
  it('renders nested data without evaluating code', () => {
    expect(renderTemplate('Hi {{ user.name }} — {{ event.title }}', { user: { name: 'Ada' }, event: { title: 'Faajii' } })).toBe('Hi Ada — Faajii');
  });
});
