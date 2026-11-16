/**
 * The one email masker: the first letter, three stars and the domain ("a***@mail.com"). An address with no local part, or no
 * "@", shows as "***". Used wherever an address is shown back (sign-in answers, staff lists, notices, refunds, support).
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}
