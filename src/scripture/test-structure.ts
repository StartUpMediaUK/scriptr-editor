import type { ScriptureStructure } from './types.js';

export const testStructure: ScriptureStructure = {
  books: [
    {
      id: 'ROM',
      name: 'Romans',
      aliases: ['Ro', 'Rom'],
      chapters: [
        32, 29, 31, 25, 21, 23, 25, 39, 33, 21, 36, 21, 14, 23, 33, 27,
      ],
    },
    {
      id: 'JHN',
      name: 'John',
      aliases: ['Jn'],
      chapters: [51, 25, 36],
    },
  ],
};
