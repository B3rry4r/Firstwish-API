/** What staff see of a contact detail: never the whole thing. A full value comes only from the audited reveal (E-4). */
export function maskPhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? `••••${digits.slice(-4)}` : digits ? "••••" : "";
}

export function maskEmail(email: string | null | undefined): string {
  const v = (email ?? "").trim();
  const at = v.lastIndexOf("@");
  if (at < 1) return v ? "••••" : "";
  return `${v[0]}•••${v.slice(at)}`;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The eight earning lines (T-69): the name staff use, the ledger account each is read from, and what it counts. */
export const LINES = [
  { line: "tickets", account: "revenue_tickets", name: "Tickets", definition: "Wish tickets sold, after refunds, before VAT." },
  { line: "extras", account: "revenue_extras", name: "Extras", definition: "Extras and upgrades bought on a wish, after refunds, before VAT." },
  { line: "keeps", account: "revenue_keeps", name: "Keeps", definition: "Keeps bought to hold a wish longer, after refunds, before VAT." },
  { line: "pass", account: "revenue_pass", name: "The Pass", definition: "Pass memberships sold, after refunds, before VAT." },
  { line: "pro_plans", account: "revenue_pro", name: "Pro plans", definition: "Business plan periods paid, after refunds, before VAT." },
  { line: "vault_space", account: "revenue_vault", name: "Vault space", definition: "Vault storage bought by businesses, after refunds, before VAT." },
  { line: "concierge", account: "revenue_concierge", name: "Concierge", definition: "Concierge orders paid, after refunds, before VAT." },
  { line: "creator_plans", account: "revenue_creator", name: "Creator plans", definition: "Creator plan periods paid, after refunds, before VAT." },
] as const;
export type LineKey = (typeof LINES)[number]["line"];

/** The earning line a payment purpose counts in (an empty string for a purpose that has no line). */
export function lineOfPurpose(purpose: string): LineKey | "" {
  switch (purpose) {
    case "ticket": return "tickets";
    case "extra": case "upgrade": case "extra_review": case "credit_pack": return "extras";
    case "keep": return "keeps";
    case "pass": case "wish_pack": return "pass";
    case "pro_plan": return "pro_plans";
    case "vault_space": return "vault_space";
    case "concierge": return "concierge";
    case "creator_plan": return "creator_plans";
    default: return "";
  }
}
