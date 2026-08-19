import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { PACKAGE_NAME } from '../src/index.ts';
import './styles.css';

function DevelopmentHarness() {
  return (
    <main className="page-shell">
      <article className="document" aria-labelledby="page-title">
        <p className="kicker">Development harness</p>
        <h1 id="page-title">{PACKAGE_NAME}</h1>
        <p className="lede">
          The package foundation is ready. Editor primitives will enter this
          quiet writing surface only after their architecture is audited.
        </p>
        <hr />
        <p className="note">
          This harness follows the authoritative prototype’s Classical design
          system: warm paper, restrained ochre accents, editorial type, and a
          focused measure.
        </p>
      </article>
    </main>
  );
}

const root = document.querySelector('#root');

if (!(root instanceof HTMLElement)) {
  throw new Error('Development harness root is missing.');
}

createRoot(root).render(
  <StrictMode>
    <DevelopmentHarness />
  </StrictMode>,
);
