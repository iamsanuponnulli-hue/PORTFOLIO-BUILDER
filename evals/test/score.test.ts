import { describe, expect, it } from 'vitest';
import { numbersIn, scoreEdit, scoreResume } from '../src/score.ts';

describe('eval scoring', () => {
  const source = 'Brightcart, 2022. Cut load time from 4.1s to 1.3s.';

  it('finds numbers', () => {
    expect(numbersIn('4.1s to 1,3s in 2022')).toEqual(['4.1', '1.3', '2022']);
  });

  it('flags invented numbers and checks facts', () => {
    const good = scoreResume(source, {
      experience: [
        {
          id: 'e1',
          company: 'Brightcart',
          role: 'Eng',
          bullets: ['Cut load time from 4.1s to 1.3s'],
        },
      ],
    });
    expect(good).toEqual({ valid: true, invented: [], recall: 1 });
    const bad = scoreResume(source, {
      experience: [{ id: 'e1', company: 'Acme', role: 'Eng', bullets: ['Grew revenue 300%'] }],
    });
    expect(bad.invented).toEqual(['300']);
    expect(bad.recall).toBe(0);
  });

  it('checks edits used an expected operation', () => {
    expect(scoreEdit([{ op: 'updateTheme', tokens: {} }], ['updateTheme'])).toBe(true);
    expect(scoreEdit([], ['updateTheme'])).toBe(false);
  });
});
