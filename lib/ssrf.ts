import { BlockList, isIP } from 'node:net'

// Any address resolved by DNS that lands in one of these ranges must not be
// fetched by the image proxy.
const blocks = new BlockList()

// IPv4 — RFC 1918 + loopback + link-local + CGNAT + IETF reserved + multicast.
blocks.addSubnet('0.0.0.0', 8, 'ipv4')           // "this network"
blocks.addSubnet('10.0.0.0', 8, 'ipv4')          // private
blocks.addSubnet('100.64.0.0', 10, 'ipv4')       // CGNAT
blocks.addSubnet('127.0.0.0', 8, 'ipv4')         // loopback
blocks.addSubnet('169.254.0.0', 16, 'ipv4')      // link-local incl. 169.254.169.254 cloud metadata
blocks.addSubnet('172.16.0.0', 12, 'ipv4')       // private
blocks.addSubnet('192.0.0.0', 24, 'ipv4')        // IETF protocol assignments
blocks.addSubnet('192.0.2.0', 24, 'ipv4')        // TEST-NET-1
blocks.addSubnet('192.168.0.0', 16, 'ipv4')      // private
blocks.addSubnet('198.18.0.0', 15, 'ipv4')       // benchmarking
blocks.addSubnet('198.51.100.0', 24, 'ipv4')     // TEST-NET-2
blocks.addSubnet('203.0.113.0', 24, 'ipv4')      // TEST-NET-3
blocks.addSubnet('224.0.0.0', 4, 'ipv4')         // multicast
blocks.addSubnet('240.0.0.0', 4, 'ipv4')         // reserved
blocks.addAddress('255.255.255.255', 'ipv4')

// IPv6. Notably absent: ::ffff:0:0/96. BlockList stores v4 addresses
// internally as v4-mapped v6, so adding that subnet would match every
// IPv4 address — we'd block the whole internet. v4-mapped is instead
// handled by extracting the embedded v4 and checking it against the
// IPv4 list (see toV4Mapped below).
blocks.addAddress('::', 'ipv6')                  // unspecified
blocks.addAddress('::1', 'ipv6')                 // loopback
blocks.addSubnet('64:ff9b::', 96, 'ipv6')        // NAT64
blocks.addSubnet('100::', 64, 'ipv6')            // discard
blocks.addSubnet('2001:db8::', 32, 'ipv6')       // documentation
blocks.addSubnet('fc00::', 7, 'ipv6')            // unique local
blocks.addSubnet('fe80::', 10, 'ipv6')           // link-local
blocks.addSubnet('ff00::', 8, 'ipv6')            // multicast

// Expand an IPv6 textual address into its 16 raw bytes. Returns null for
// anything that doesn't parse — caller treats that as a rejection.
// Handles `::` zero-compression and the trailing-IPv4 form
// (`::ffff:127.0.0.1` and `0:0:0:0:0:ffff:192.0.2.128`).
function expandIPv6(addr: string): Uint8Array | null {
  let s = addr.toLowerCase()
  // Convert any trailing dotted-quad into two hex groups.
  const trailing = /:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(s)
  if (trailing) {
    const parts = trailing[1].split('.').map(Number)
    if (parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return null
    const hi = ((parts[0] << 8) | parts[1]).toString(16)
    const lo = ((parts[2] << 8) | parts[3]).toString(16)
    s = s.slice(0, -trailing[1].length) + `${hi}:${lo}`
  }
  let groups: string[]
  if (s.includes('::')) {
    const [left, right] = s.split('::')
    const l = left ? left.split(':') : []
    const r = right ? right.split(':') : []
    const fill = 8 - l.length - r.length
    if (fill < 0) return null
    groups = [...l, ...Array<string>(fill).fill('0'), ...r]
  } else {
    groups = s.split(':')
  }
  if (groups.length !== 8) return null
  const bytes = new Uint8Array(16)
  for (let i = 0; i < 8; i++) {
    const g = groups[i]
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null
    const n = parseInt(g, 16)
    bytes[i * 2] = (n >> 8) & 0xff
    bytes[i * 2 + 1] = n & 0xff
  }
  return bytes
}

// If the address is v4-mapped IPv6 (::ffff:a.b.c.d in any notation, including
// the hex form ::ffff:7f00:1), return the embedded IPv4 dotted string.
function toV4Mapped(addr: string): string | null {
  const bytes = expandIPv6(addr)
  if (!bytes) return null
  for (let i = 0; i < 10; i++) if (bytes[i] !== 0) return null
  if (bytes[10] !== 0xff || bytes[11] !== 0xff) return null
  return `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`
}

export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip)
  if (v === 0) return true                       // fail closed on garbage input
  if (v === 4) return blocks.check(ip, 'ipv4')
  // v === 6
  const mapped = toV4Mapped(ip)
  if (mapped) return blocks.check(mapped, 'ipv4')
  return blocks.check(ip, 'ipv6')
}
