import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';

const additionalNonGlobalCidrs = ['100::/64', '2001:2::/48', '3fff::/20'].map(ipaddr.parseCIDR);
export const isGlobalAddress = (host: string) => {
  try {
    const address = ipaddr.parse(host);
    return address.range() === 'unicast' && !additionalNonGlobalCidrs.some(([network, prefix]) => {
      if (address.kind() === 'ipv4' && network.kind() === 'ipv4') return (address as ipaddr.IPv4).match(network as ipaddr.IPv4, prefix);
      if (address.kind() === 'ipv6' && network.kind() === 'ipv6') return (address as ipaddr.IPv6).match(network as ipaddr.IPv6, prefix);
      return false;
    });
  } catch { return false; }
};

export const safeHttpsUrl = (value: string | null | undefined) => {
  if (!value) return false;
  try {
    const url = new URL(value); const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const ipVersion = isIP(host);
    return url.protocol === 'https:' && !url.username && !url.password && host !== 'localhost' &&
      (ipVersion === 0 || isGlobalAddress(host));
  } catch { return false; }
};

export type AddressResolver = (hostname: string) => Promise<Array<{ address: string }>>;
export const safeResolvedHttpsUrl = async (value: string | null | undefined, resolver: AddressResolver = (hostname) => lookup(hostname, { all: true, verbatim: true })) => {
  if (!safeHttpsUrl(value)) return false;
  const host = new URL(value!).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (isIP(host)) return isGlobalAddress(host);
  try {
    const addresses = await resolver(host);
    return addresses.length > 0 && addresses.every(({ address }) => isGlobalAddress(address));
  } catch { return false; }
};
