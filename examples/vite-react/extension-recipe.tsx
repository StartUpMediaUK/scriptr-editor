import type { ExtensionRegistration } from '@startupmedia/scriptr-editor/extensions';
import type { JsonValue } from '@startupmedia/scriptr-editor/document';
import { defineReactExtension } from '@startupmedia/scriptr-editor/react';

type TimedNote = { positionSeconds: number; label: string };

function record(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function parseTimedNote(input: unknown): TimedNote {
  if (
    !record(input) ||
    typeof input.positionSeconds !== 'number' ||
    !Number.isFinite(input.positionSeconds) ||
    input.positionSeconds < 0 ||
    typeof input.label !== 'string' ||
    !input.label.trim()
  )
    throw new Error('A timed note needs a nonnegative position and a label.');
  return { positionSeconds: input.positionSeconds, label: input.label.trim() };
}

export const timedNoteRegistration: ExtensionRegistration = {
  name: 'com.example.podcast.timed-note',
  version: 2,
  parseData: parseTimedNote,
  migrations: [
    {
      from: 1,
      to: 2,
      migrate(data: JsonValue) {
        if (!record(data)) throw new Error('Invalid legacy timed note.');
        return parseTimedNote({
          positionSeconds: data.seconds,
          label: data.label,
        });
      },
    },
  ],
};

/** The host owns playback; the block stores only portable authored intent. */
export function createTimedNoteRenderer() {
  return defineReactExtension({
    name: timedNoteRegistration.name,
    version: timedNoteRegistration.version,
    parseData: parseTimedNote,
    renderReadonly: (data) => (
      <p>
        {data.label} — {data.positionSeconds}s
      </p>
    ),
    renderEditable: (data) => (
      <p>
        {data.label} — {data.positionSeconds}s
      </p>
    ),
    slashItems: [
      {
        id: 'com.example.podcast.timed-note.insert',
        label: 'Timed note',
        hint: 'A host-owned playback position',
        createBlock: () => ({
          id: crypto.randomUUID(),
          type: 'extension',
          name: timedNoteRegistration.name,
          version: 2,
          data: { positionSeconds: 0, label: 'Opening' },
        }),
      },
    ],
  });
}
