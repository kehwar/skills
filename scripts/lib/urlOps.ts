/**
 * Expand `owner/repo` shorthand to a full GitHub HTTPS URL.
 * Full URLs pass through unchanged.
 */
export function normalizeUrl(url: string): string {
  if (/^https?:\/\//.test(url) || url.startsWith('git@'))
    return url
  const parts = url.split('/')
  if (parts.length === 2)
    return `https://github.com/${url}`
  return url
}
