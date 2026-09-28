const allowedProtocols = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export function normalizeExternalUrl(value: string): string | undefined {
  const candidate = value.trim();
  if (!candidate || /\s/.test(candidate)) return undefined;
  const withProtocol = /^[a-z][a-z\d+.-]*:/i.test(candidate)
    ? candidate
    : `https://${candidate}`;
  try {
    const parsed = new URL(withProtocol);
    if (!allowedProtocols.has(parsed.protocol)) return undefined;
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      return parsed.hostname === 'localhost' || parsed.hostname.includes('.')
        ? parsed.href
        : undefined;
    if (parsed.protocol === 'mailto:')
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(parsed.pathname)
        ? parsed.href
        : undefined;
    return /^\+?[\d(). -]{5,}$/.test(parsed.pathname) ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

export function isSafeExternalUrl(value: string): boolean {
  return normalizeExternalUrl(value) !== undefined;
}
