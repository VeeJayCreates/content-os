declare module 'ipaddr.js' {
  interface Address {
    kind(): 'ipv4' | 'ipv6';
    match(address: Address, prefixLength: number): boolean;
    range(): string;
  }
  const ipaddr: {
    parse(value: string): Address;
    parseCIDR(value: string): [Address, number];
  };
  export default ipaddr;
}
