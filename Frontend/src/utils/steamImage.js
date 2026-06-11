const STEAM_CDN_REPLACEMENTS = [
  ['steamcdn-a.akamaihd.net', 'cdn.cloudflare.steamstatic.com'],
  ['cdn.akamai.steamstatic.com', 'cdn.cloudflare.steamstatic.com'],
]

/**
 * 将 Steam 旧 CDN 域名替换为当前可访问的 Cloudflare CDN
 */
export function normalizeSteamImageUrl(url) {
  if (!url || typeof url !== 'string') return url

  let normalized = url.trim()
  if (!normalized) return normalized

  for (const [oldHost, newHost] of STEAM_CDN_REPLACEMENTS) {
    normalized = normalized.replace(new RegExp(oldHost, 'gi'), newHost)
  }

  if (normalized.startsWith('//')) {
    normalized = `https:${normalized}`
  }

  return normalized
}
