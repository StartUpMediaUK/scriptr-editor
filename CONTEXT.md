# Scriptr Editor

Scriptr Editor is reusable writing infrastructure in which Scripture is a native authored element. This glossary names concepts that cross the package's document, host, and rendering seams.

## Language

**Canonical Document**:
The portable, versioned representation of authored content owned by this package. It is independent of an editor engine, React, storage, and any consuming application.
_Avoid_: Editor JSON, Page, study document

**Block**:
A top-level authored structural element in a Canonical Document, such as a paragraph, list, Scripture passage, comparison, or image.
_Avoid_: Widget, card

**Mark**:
Meaning attached to a span of inline text, including emphasis, links, internal document links, and Reference anchors.
_Avoid_: Inline block, decoration

**Reference**:
A shallow rich-text annotation whose anchor is a marked text span in the same Canonical Document.
_Avoid_: Citation, footnote, linked document

**Scripture Address**:
A canonical book, chapter, verse, or verse-range location that does not include rendered passage text.
_Avoid_: Passage, verse text

**Scripture Block**:
An authored Block containing a Scripture Address and one deliberately selected translation identifier.
_Avoid_: Bible quote, auto-reference

**Translation Comparison**:
An authored Block containing one Scripture Address and an ordered set of translation identifiers plus its layout.
_Avoid_: Scripture Block group

**Internal Document Link**:
A Mark targeting an opaque document identifier supplied by the host. The package neither defines the target as a Page nor owns backlink behaviour.
_Avoid_: Page link, backlink

**Host**:
The consuming application that supplies external capabilities and owns application data and policy.
_Avoid_: Scriptr app, client

**Extension Block**:
A namespaced, versioned Block whose JSON-compatible data and rendering behaviour are supplied by an extension definition.
_Avoid_: Custom blob, plugin state
