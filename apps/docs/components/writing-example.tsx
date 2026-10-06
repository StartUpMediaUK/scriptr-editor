'use client';

import { useState } from 'react';
import type { CanonicalDocument } from 'scriptr-editor/document';
import {
  ScriptrEditor,
  ScriptrPresentationProvider,
  ScriptrPresentationSurface,
  ScriptrRenderer,
} from 'scriptr-editor/react';

/** Serializable data crosses the framework boundary, not host callbacks. */
export function WritingExample({
  initialDocument,
}: {
  readonly initialDocument: CanonicalDocument;
}) {
  const [document, setDocument] = useState(initialDocument);
  return (
    <ScriptrPresentationProvider>
      <ScriptrPresentationSurface>
        <main className="mx-auto max-w-4xl px-6 py-12">
          <h1>Next.js consumer example</h1>
          <p>
            This example keeps changes in memory. Reloading restores its initial
            document.
          </p>
          <ScriptrEditor value={document} onChange={setDocument} />
          <h2>Read-only output</h2>
          <ScriptrRenderer document={document} />
        </main>
      </ScriptrPresentationSurface>
    </ScriptrPresentationProvider>
  );
}
