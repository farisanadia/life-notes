import { describe, it, expect } from 'vitest'
import { isPrivateIp } from '@/lib/ssrf'

describe('isPrivateIp', () => {
  describe('IPv4 — private/loopback/special ranges (must reject)', () => {
    it.each([
      ['0.0.0.0', '"this network"'],
      ['0.1.2.3', '0.0.0.0/8'],
      ['10.0.0.1', 'RFC 1918'],
      ['10.255.255.255', 'RFC 1918 boundary'],
      ['100.64.0.1', 'CGNAT'],
      ['100.127.255.254', 'CGNAT boundary'],
      ['127.0.0.1', 'loopback'],
      ['127.0.0.53', 'loopback resolver'],
      ['169.254.1.1', 'link-local'],
      ['169.254.169.254', 'AWS/GCP cloud metadata'],
      ['172.16.0.1', 'RFC 1918'],
      ['172.31.255.254', 'RFC 1918 boundary'],
      ['192.168.0.1', 'RFC 1918'],
      ['192.168.1.1', 'home router'],
      ['224.0.0.1', 'IPv4 multicast'],
      ['239.255.255.250', 'SSDP multicast'],
      ['255.255.255.255', 'broadcast'],
    ])('rejects %s (%s)', ip => {
      expect(isPrivateIp(ip)).toBe(true)
    })
  })

  describe('IPv4 — public (must allow)', () => {
    it.each([
      ['1.1.1.1', 'Cloudflare DNS'],
      ['8.8.8.8', 'Google DNS'],
      ['140.82.114.3', 'github.com'],
      ['142.250.80.46', 'google.com'],
      ['151.101.0.81', 'fastly CDN'],
    ])('allows %s (%s)', ip => {
      expect(isPrivateIp(ip)).toBe(false)
    })
  })

  describe('IPv6 — private/loopback/special ranges (must reject)', () => {
    it.each([
      ['::', 'unspecified'],
      ['::1', 'loopback'],
      ['fc00::1', 'unique local'],
      ['fd12:3456:789a::1', 'unique local'],
      ['fe80::1', 'link-local'],
      ['febf::ffff:ffff:ffff:ffff', 'link-local boundary'],
      ['ff02::1', 'IPv6 multicast all-nodes'],
      ['ff05::1:3', 'IPv6 multicast site-local'],
      ['::ffff:127.0.0.1', 'IPv4-mapped loopback (dotted)'],
      ['::ffff:7f00:1', 'IPv4-mapped loopback (hex notation) — known bypass class'],
      ['::ffff:10.0.0.1', 'IPv4-mapped RFC 1918'],
      ['::ffff:a9fe:a9fe', 'IPv4-mapped cloud metadata in hex'],
      ['2001:db8::1', 'documentation prefix'],
    ])('rejects %s (%s)', ip => {
      expect(isPrivateIp(ip)).toBe(true)
    })
  })

  describe('IPv6 — public (must allow)', () => {
    it.each([
      ['2606:4700:4700::1111', 'Cloudflare DNS'],
      ['2001:4860:4860::8888', 'Google DNS'],
      ['2620:0:861:ed1a::1', 'Wikipedia'],
    ])('allows %s (%s)', ip => {
      expect(isPrivateIp(ip)).toBe(false)
    })
  })

  describe('invalid input — fail closed', () => {
    it.each([
      ['', 'empty'],
      ['not.an.ip', 'hostname'],
      ['999.999.999.999', 'octets out of range'],
      ['1.2.3', 'truncated v4'],
      ['gg::1', 'invalid hex v6'],
      ['1.2.3.4.5', 'too many octets'],
    ])('rejects %s (%s)', input => {
      expect(isPrivateIp(input)).toBe(true)
    })
  })
})
