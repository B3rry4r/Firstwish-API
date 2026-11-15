import { isIPv4, isIPv6 } from "node:net";

/**
 * A staff address is kept cut to its network, never in full (B03 case 4): IPv4 to its /24, IPv6 to its /48.
 * An IPv4 address carried inside IPv6 (::ffff:1.2.3.4) is treated as IPv4. Anything that is not an address gives null.
 */
export function networkOf(address: string | null | undefined): string | null {
  if (!address) return null;
  let a = address.trim();
  const zone = a.indexOf("%");
  if (zone >= 0) a = a.slice(0, zone);
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(a);
  if (mapped) a = mapped[1];
  if (isIPv4(a)) {
    const [p1, p2, p3] = a.split(".");
    return `${p1}.${p2}.${p3}.0/24`;
  }
  if (isIPv6(a)) {
    const groups = expandIPv6(a);
    return `${groups.slice(0, 3).join(":")}::/48`;
  }
  return null;
}

/** The eight hextets of an IPv6 address, lowercased without leading zeros. */
function expandIPv6(a: string): string[] {
  let text = a.toLowerCase();
  // An embedded IPv4 tail becomes two hextets.
  const v4 = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (v4) {
    const [b1, b2, b3, b4] = v4.slice(1).map(Number);
    text = text.slice(0, v4.index) + `${((b1 << 8) | b2).toString(16)}:${((b3 << 8) | b4).toString(16)}`;
  }
  const [head, tail] = text.includes("::") ? text.split("::") : [text, undefined];
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const fill = tail === undefined ? [] : new Array<string>(8 - left.length - right.length).fill("0");
  return [...left, ...fill, ...right].map((g) => (parseInt(g || "0", 16) || 0).toString(16));
}
