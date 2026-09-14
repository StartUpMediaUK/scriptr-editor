class TestResizeObserver implements ResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

globalThis.ResizeObserver ??= TestResizeObserver;
if (
  typeof Element !== 'undefined' &&
  !('scrollIntoView' in Element.prototype)
) {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: () => undefined,
  });
}

if (typeof Element !== 'undefined' && !('getAnimations' in Element.prototype)) {
  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    value: () => [],
  });
}
