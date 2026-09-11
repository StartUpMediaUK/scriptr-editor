import type { ScriptureStructure } from './types.js';

export const testStructure: ScriptureStructure = {
  books: [
    {
      id: 'ROM',
      name: 'Romans',
      aliases: ['Ro', 'Rom'],
      testament: 'new',
      chapters: [
        32, 29, 31, 25, 21, 23, 25, 39, 33, 21, 36, 21, 14, 23, 33, 27,
      ],
    },
    {
      id: 'JHN',
      name: 'John',
      aliases: ['Jn'],
      testament: 'new',
      chapters: [51, 25, 36],
    },
    {
      id: '1JN',
      name: '1 John',
      aliases: ['1 Jn'],
      testament: 'new',
      chapters: [10, 10, 10, 10, 10],
    },
    {
      id: '2JN',
      name: '2 John',
      aliases: ['2 Jn'],
      testament: 'new',
      chapters: [13],
    },
    {
      id: '3JN',
      name: '3 John',
      aliases: ['3 Jn'],
      testament: 'new',
      chapters: [14],
    },
  ],
};
