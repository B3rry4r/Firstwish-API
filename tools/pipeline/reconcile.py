#!/usr/bin/env python3
"""Phase 3 reconcile (contract-driven-backend). Mechanical, standard library only, deterministic.

Reads .pipeline/{fragments/*.json, declared/*.json, supersedes.json, product-truths.json, decisions.json,
stubs.json, conventions.md, scan-map.json, framework-decision.json} and tools/pipeline/aliases.json.
Writes .pipeline/{registry.json, dep-graph.json, conflicts.json, ui-align-tasks.json, entitlements.json,
field-flow.json, metrics.json, reconcile-log.md}.

Steps (SKILL.md Phase 3): 1 apply supersedes, 2 group by entity (aliases), 3 merge fields, 4 truth check,
5 derive endpoints, 6 collisions, 7 ui-align tasks, 8 format canon, 9 outputs. Never resolves a conflict:
a decision or supersede is applied and cited by id; anything else is a conflict row quoting its sources.
Re-run it whenever fragments change; nothing is edited by hand afterwards.
While .pipeline/registry.lock.json exists the registry is frozen and this refuses to run (exit 2) unless called
with --reopen "<ruling ids>" naming the rulings that reopen it; tools/pipeline/freeze.py locks it again (DEC-136).
"""
import fnmatch
import glob
import json
import os
import re
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
PIPE = os.path.join(ROOT, ".pipeline")

STAFF_ROLES = ["owner", "ops", "moderator", "reviewer", "support", "finance", "maker"]
GENERIC_UPDATE = ("save", "set", "write", "edit", "toggle", "choose", "pick", "advance", "make", "remove", "sync",
                  "skip", "continue", "use", "complete", "update")
CLIENT_ONLY = re.compile(r"navigation only|link only|links? to /|no server call|no server write|browser-only|no write on|"
                         r"purchase happens off-screen|only advances|link on the resting screen|stays local", re.I)
PATH_RE = re.compile(r"\b(GET|POST|PUT|PATCH|DELETE) (/v1/[A-Za-z0-9_:\-/]+)")
FILE_RE = re.compile(r"((?:[\w\-\[\]]+/)*[\w\-\[\]]+\.(?:tsx|ts|js|mjs))")
NAIRA_RE = re.compile(r"₦\s?(\d[\d,]*)")
IDENT = re.compile(r"^[A-Z][A-Za-z0-9]*$")
# A14 (DEC-125): every changing /v1/admin request carries `reason`, except the three staff sign-in routes;
# code and verify are the only /v1/admin routes allowed without a staff role (public, before sign-in).
REASON_DECISION = "DEC-125"
# S5 (DEC-148): the staff refresh is a fourth sign-in route, public by the staff refresh cookie.
ADMIN_SIGNIN = {("POST", "/v1/admin/auth/code"), ("POST", "/v1/admin/auth/verify"), ("POST", "/v1/admin/auth/sign-out"),
                ("POST", "/v1/admin/auth/refresh")}
ADMIN_PUBLIC = {("POST", "/v1/admin/auth/code"), ("POST", "/v1/admin/auth/verify"), ("POST", "/v1/admin/auth/refresh")}
VIEW_RE = re.compile(r"^([A-Z][A-Za-z0-9]*) \(")
STOP = set("a an the and or of to on in for one set save get list create update delete start make add remove by "
           "with is it its no not all every each from as at be can only any wish page per".split())
WEAK = set("included more day month year account sign space person pay opening upload file paid list "
           "decide preview change time term".split())
IDENTITY_DECL = ["auth-codes", "sessions", "google-identity", "staff-accounts"]
MONEY_DECL = ["payments", "ledger", "refunds", "price-book", "royalties-payouts"]


def load(name):
    with open(os.path.join(PIPE, name), encoding="utf-8") as f:
        return json.load(f)


def dump(name, obj):
    with open(os.path.join(PIPE, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write("\n")


def kebab(s):
    s = re.sub(r"([a-z0-9])([A-Z])", r"\1-\2", s)
    return re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()


def plural(word):
    if word.endswith(("ss", "x", "sh", "ch")):
        return word + "es"
    if word.endswith("s"):
        return word
    if word.endswith("y") and word[-2:-1] not in "aeiou":
        return word[:-1] + "ies"
    return word + "s"


def route_base(res):
    parts = kebab(res).split("-")
    parts[-1] = plural(parts[-1])
    return "/v1/" + "-".join(parts)


def camel_tokens(s):
    s = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", s)
    out = []
    for w in re.split(r"[^A-Za-z0-9]+", s.lower()):
        if not w or w in STOP:
            continue
        if len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
            w = w[:-1]
        out.append(w)
    return out


def strip_paren(name):
    return re.sub(r"\s*\(.*\)\s*$", "", name).strip()


# ---------------------------------------------------------------- type classes and format canon
def tclass(name, typ):
    raw = (typ or "").strip()
    t = raw.lower()
    n = name.split(".")[-1].replace("[]", "")
    tk = canon_kind(name) == "time"
    if "₦" in t or "naira" in t:
        return "money-naira"
    if "kobo" in t or n.endswith("Kobo"):
        return "money-kobo"
    if re.search(r"(^|[a-z])(price|Price)", n) or n in ("was", "amount", "cost", "fee", "vat"):
        if re.search(r"number|integer|int\b|float", t):
            return "money-number"
        if t.startswith("string"):
            return "money-naira"
    if t in ("true", "false"):
        return "boolean"
    if t.startswith("{") or t.startswith("record<") or t.startswith("map<") or t.startswith("json") or t.startswith("object"):
        return "object"
    if "epoch" in t or (tk and re.search(r"\bms\b", t)):
        return "time-epoch"
    if re.match(r"^[\w<>'\"|]+\[\]", raw) or t.startswith("array") or t.startswith("list<") or t.startswith("["):
        return "array"
    if re.search(r"\biso\b|datetime|timestamp|yyyy-mm-dd", t) or t in ("date", "time", "instant") or t.startswith("date ") \
            or (tk and re.search(r"\bdate\b", t)):
        return "time-iso"
    if t.startswith("enum") or ("|" in t and ("'" in t or '"' in t)):
        return "enum"
    if t.startswith("bool"):
        return "boolean"
    if t.startswith("integer") or t.startswith("int"):
        return "integer"
    if t.startswith("number") or t.startswith("float") or re.match(r"^-?\d", t):
        return "number"
    if re.match(r"^[A-Za-z]+\|[A-Za-z|]+$", raw):
        return "enum"
    if t.startswith("string") or t in ("text", "url", "slug", "uuid", "header", "string?"):
        return "string"
    if t.startswith("bytes") or t.startswith("file") or t.startswith("blob"):
        return "binary"
    if raw[:1].isupper():
        return "named"
    return "unknown"


FAMILY = {"string": "string", "enum": "string", "integer": "number", "number": "number", "money-kobo": "money",
          "money-naira": "money", "money-number": "money", "time-iso": "time", "time-epoch": "time",
          "array": "array", "boolean": "boolean", "object": "object", "binary": "binary", "named": None, "unknown": None}


def families(classes, name):
    """Families compared for type-mismatch. A named type (its definition is not in the fragment) or prose we
    cannot read is not compared; a bare string on a time field is the ISO wire form."""
    out = set()
    for c in classes:
        fam = FAMILY[c]
        if fam is None:
            continue
        if fam == "string" and canon_kind(name) == "time":
            fam = "time"
        out.add(fam)
    return sorted(out)


def canon_kind(name):
    n = name.split(".")[-1].replace("[]", "")
    if n == "id" or (n.endswith("Id") and len(n) > 2):
        return "id"
    if re.search(r"phone", n, re.I):
        return "phone"
    if re.search(r"email", n, re.I):
        return "email"
    if n in ("contact", "destination", "payerContact", "reporterContact", "to"):
        return "contact"
    if n.endswith("At") or n in ("createdAt", "date", "at", "since", "validUntil", "until", "dueAt"):
        return "time"
    return None


def conflict_key(kind, entity, detail):
    """Stable key a decision names to close a conflict; independent of row order."""
    return "%s|%s|%s" % (kind, entity, re.sub(r"\s*\(it can be bought.*\)$", "", detail)[:140])


# ---------------------------------------------------------------- main
def main():
    lock_path = os.path.join(PIPE, "registry.lock.json")
    reopen = sys.argv[sys.argv.index("--reopen") + 1] if "--reopen" in sys.argv[1:-1] else None
    if os.path.exists(lock_path) and not (reopen and reopen.strip()):
        print("REFUSED: .pipeline/registry.lock.json exists, so the registry is frozen (%s). A change needs a new ruling: "
              "run with --reopen \"<ruling ids>\" naming it, then tools/pipeline/freeze.py to lock again." % load("registry.lock.json").get("decision"))
        return 2
    if reopen:
        print("REOPENED by %s" % reopen.strip())
    aliases = json.load(open(os.path.join(HERE, "aliases.json"), encoding="utf-8"))
    sup = load("supersedes.json")["entries"]
    truths = load("product-truths.json")["truths"]
    decisions = load("decisions.json")["decisions"]
    stubs = load("stubs.json")["stubs"]
    scan = load("scan-map.json")
    conventions = open(os.path.join(PIPE, "conventions.md"), encoding="utf-8").read()
    framework = load("framework-decision.json")
    routes = json.load(open(os.path.join(HERE, "routes.json"), encoding="utf-8"))
    owed_tab = json.load(open(os.path.join(HERE, "metrics-owed.json"), encoding="utf-8"))
    sup_all = sup
    sup = [x for x in sup_all if not x.get("supersededBy")]
    dec_all = decisions
    decisions = [x for x in dec_all if not x.get("supersededBy")]
    deferred = []

    sources = {}  # id -> dict(kind, data, text)
    order = []
    for path in sorted(glob.glob(os.path.join(PIPE, "fragments", "*.json"))):
        d = json.load(open(path, encoding="utf-8"))
        sid = d.get("screenId") or os.path.basename(path)[:-5]
        sources[sid] = {"kind": "screen", "data": d, "text": json.dumps(d, ensure_ascii=False), "file": "fragments/" + os.path.basename(path)}
        order.append(sid)
    for path in sorted(glob.glob(os.path.join(PIPE, "declared", "*.json"))):
        d = json.load(open(path, encoding="utf-8"))
        sid = d.get("resource") or os.path.basename(path)[:-5]
        if d.get("status") == "deferred-by-owner":
            deferred.append((sid, d.get("deferredBy", "")))
            continue
        sources[sid] = {"kind": "declaration", "data": d, "text": json.dumps(d, ensure_ascii=False), "file": "declared/" + os.path.basename(path)}
        order.append(sid)
    screens = {s["id"]: s for s in scan["screens"]}

    conflicts = []
    log = []

    def conflict(kind, entity, detail, srcs, options=None, extra=None):
        row = {"kind": kind, "entity": entity, "detail": detail, "key": conflict_key(kind, entity, detail),
               "sources": srcs, "options": options or [], "status": "open"}
        if extra:
            row.update(extra)
        conflicts.append(row)
        return row

    # alias table sanity: every alias names two sources that exist
    alias_errors = []
    for section in ("entities", "actions", "fields"):
        for raw, e in sorted(aliases.get(section, {}).items()):
            for s in e.get("sources", []):
                if s not in sources:
                    alias_errors.append("%s %s: source %s not found" % (section, raw, s))
            if len(e.get("sources", [])) != 2:
                alias_errors.append("%s %s: needs exactly two sources" % (section, raw))
    if alias_errors:
        print("ALIAS TABLE ERRORS:\n" + "\n".join(alias_errors))
        sys.exit(2)

    def canon_entity(raw, sid=None):
        e = aliases["entities"].get("%s:%s" % (sid, raw)) if sid else None
        e = e or aliases["entities"].get(raw)
        if e:
            if "embeddedIn" in e:
                return e["embeddedIn"]["resource"], e["embeddedIn"]["field"], e
            return e["canonical"], None, e
        if IDENT.match(raw):
            return raw, None, None
        # a name with a note in brackets is a view of the resource named before the bracket (DEC-113)
        vm = VIEW_RE.match(raw)
        if vm:
            return canon_entity(vm.group(1), sid)
        return None, None, None

    # ------------------------------------------------------------ step 1: supersedes
    sup_by_id = {s["id"]: s for s in sup}
    sup_class = {}  # canon class -> supersede id that authorises the transform
    for s in sup:
        tgt = s["targetState"]
        for cls, key in (("money", "kobo"), ("id", "UUIDv7"), ("phone", "E.164"), ("time", "ISO-8601")):
            if key.lower() in tgt.lower():
                if cls in sup_class and sup_class[cls][1] != key:
                    print("HALT: supersedes %s and %s contradict on %s" % (sup_class[cls][0], s["id"], cls))
                    sys.exit(3)
                sup_class.setdefault(cls, (s["id"], key))
    sup_match = {}  # sid -> {screen: [files]}
    for s in sup:
        refs = sorted(set(FILE_RE.findall(s["asBuilt"])))
        hits = {}
        for sid in order:
            if sources[sid]["kind"] != "screen":
                continue
            sc = screens.get(sid, {})
            files = sc.get("uiFiles", []) + sc.get("dataFiles", [])
            got = []
            for r in refs:
                if any(f == r or f.endswith("/" + r) or r.endswith("/" + f) for f in files) or r in sources[sid]["text"]:
                    got.append(r)
            if got:
                inscreen = [f for f in files if any(f == r or f.endswith("/" + r) or r.endswith("/" + f) for r in got)]
                hits[sid] = sorted(set(inscreen or got))
        sup_match[s["id"]] = hits
    sup_field_apply = defaultdict(int)

    # ------------------------------------------------------------ step 2/3: group and merge
    res = {}

    def R(name):
        if name not in res:
            res[name] = {"fields": {}, "screens": set(), "decls": set(), "embedded": set(), "reads": [], "client": False}
        return res[name]

    def add_field(rname, fname, typ, nullable, sid, note=None):
        fa = aliases.get("fields", {}).get("%s.%s" % (rname, fname))
        if fa:
            fname = fa["canonical"]
        r = R(rname)
        f = r["fields"].setdefault(fname, {"seen": [], "supersedes": set(), "nullable": set()})
        cls = tclass(fname, typ)
        ck = canon_kind(fname)
        applied = None
        if sources[sid]["kind"] == "screen":
            if cls == "time-epoch" and "time" in sup_class:
                applied = sup_class["time"][0]
                cls = "time-iso"
            elif cls in ("money-naira", "money-number") and "money" in sup_class:
                applied = sup_class["money"][0]
                cls = "money-kobo"
            elif ck == "id" and "id" in sup_class:
                applied = sup_class["id"][0]
            elif ck in ("phone", "contact") and "phone" in sup_class:
                applied = sup_class["phone"][0]
        if applied:
            f["supersedes"].add(applied)
            sup_field_apply[applied] += 1
        f["seen"].append({"src": sid, "type": typ, "class": cls})
        if nullable is not None:
            f["nullable"].add(bool(nullable))

    unclassified = defaultdict(set)
    read_reqs = []  # screen reads that become GET endpoints
    for sid in order:
        src = sources[sid]
        d = src["data"]
        for rd in d.get("reads", []):
            rname, emb, ali = canon_entity(rd["entity"], sid)
            if rname is None:
                unclassified[rd["entity"]].add(sid)
                continue
            if rname in ("@client", "@web"):
                continue
            r = R(rname)
            (r["screens"] if src["kind"] == "screen" else r["decls"]).add(sid)
            prefix = (emb + ".") if emb else ""
            if emb:
                r["embedded"].add((rd["entity"], emb))
            for fd in rd.get("fields", []):
                add_field(rname, prefix + fd["name"], fd.get("type"), fd.get("nullable"), sid, fd.get("note"))
            if src["kind"] == "screen":
                read_reqs.append({"resource": rname, "cardinality": "single" if emb else rd.get("cardinality", "list"),
                                  "src": sid, "entity": rd["entity"], "pagination": rd.get("pagination"),
                                  "filters": rd.get("filtersOrSort", [])})
        for a in d.get("actions", []):
            rname, emb, ali = canon_entity(a["entity"], sid)
            if rname is None:
                unclassified[a["entity"]].add(sid)
            elif rname not in ("@client", "@web"):
                r = R(rname)
                (r["screens"] if src["kind"] == "screen" else r["decls"]).add(sid)
                prefix = (emb + ".") if emb else ""
                for p in a.get("payload", []):
                    if p.get("type") == "header" or p["name"].lower().startswith("x-") or p["name"] == "Idempotency-Key":
                        continue
                    if p["name"] in ("id", "raw body"):
                        continue
                    add_field(rname, prefix + p["name"], p.get("type"), p.get("nullable"), sid)
    for raw, sids in sorted(unclassified.items()):
        conflict("unclassified-entity", raw, "entity name is not in tools/pipeline/aliases.json and is not a plain resource name",
                 [{"src": s, "quote": raw} for s in sorted(sids)], ["add an alias entry", "rename in the fragment"])

    # resources and fields a decision names (routes.json extraFields: the field table)
    dec_ids = set(d_["id"] for d_ in decisions)
    for x in routes.get("extraFields", []):
        if x["decision"] in dec_ids:
            sources.setdefault(x["decision"], {"kind": "decision", "data": {}, "text": ""})
            add_field(x["resource"], x["name"], x["type"], x.get("nullable"), x["decision"])
    # fields a decision makes optional on a shape (routes.json optionalFields: X1, X15 in INT-2); the type stays as the sources give it
    for x in routes.get("optionalFields", []):
        if x["decision"] in dec_ids:
            f_ = R(x["resource"])["fields"].get(x["name"])
            if f_ is None:
                print("HALT: routes.json optionalFields names %s.%s, which no source makes" % (x["resource"], x["name"]))
                sys.exit(3)
            f_["nullable"].add(True)

    def srcs_of(name):
        out = set()
        for sid_ in order:
            d_ = sources[sid_]["data"]
            for x in d_.get("reads", []) + d_.get("actions", []):
                if x["entity"] == name or canon_entity(x["entity"], sid_)[0] == name:
                    out.add(sid_)
        return out

    # possible aliases from the table
    for pa in aliases.get("possibleAliases", []):
        conflict("possible-alias", pa["a"] + " ~ " + pa["b"], pa["why"],
                 [{"src": s, "quote": pa["a"]} for s in sorted(srcs_of(pa["a"]))][:3] +
                 [{"src": s, "quote": pa["b"]} for s in sorted(srcs_of(pa["b"]))][:3],
                 ["same thing: add an alias", "different things: keep both"])

    # field type conflicts and possible field aliases
    for rname in sorted(res):
        r = res[rname]
        for fname in sorted(r["fields"]):
            f = r["fields"][fname]
            fams = families([s["class"] for s in f["seen"]], fname)
            if len(fams) > 1:
                by = defaultdict(list)
                for s in f["seen"]:
                    for fm in families([s["class"]], fname):
                        by[fm].append(s)
                conflict("type-mismatch", rname, "%s.%s is seen as %s" % (rname, fname, " vs ".join(fams)),
                         [{"src": s["src"], "quote": "%s: %s" % (fname, s["type"])} for fam in fams for s in by[fam][:2]],
                         fams)
        norm = defaultdict(list)
        for fname in r["fields"]:
            if "." in fname or "[" in fname:
                continue
            k = re.sub(r"(Kobo|Id|At|Slug|Url|Ids)$", "", fname).lower()
            norm[k].append(fname)
        for k, names in sorted(norm.items()):
            if len(names) > 1 and ("%s.%s" % (rname, names[0])) not in aliases.get("fields", {}):
                names = sorted(names)
                conflict("possible-alias", rname, "%s fields %s may be one field" % (rname, " / ".join(names)),
                         [{"src": r["fields"][n]["seen"][0]["src"], "quote": "%s: %s" % (n, r["fields"][n]["seen"][0]["type"])} for n in names],
                         ["same field: add a field alias", "different fields"])

    # ------------------------------------------------------------ step 8: format canon
    for rname in sorted(res):
        for fname in sorted(res[rname]["fields"]):
            f = res[rname]["fields"][fname]
            ck = canon_kind(fname)
            classes = set(s["class"] for s in f["seen"])
            bad = []
            if "time-epoch" in classes or (ck == "time" and classes & {"number", "integer"}):
                bad = [s for s in f["seen"] if s["class"] in ("time-epoch", "number", "integer")]
                why = "time must be ISO-8601 UTC on the wire (conventions.md canon); no supersede covers epoch numbers"
            elif ck == "id" and classes & {"number", "integer"}:
                bad = [s for s in f["seen"] if s["class"] in ("number", "integer")]
                why = "ids are UUIDv7 strings (conventions.md canon)"
            elif "money-number" in classes and "money" not in sup_class:
                bad = [s for s in f["seen"] if s["class"] == "money-number"]
                why = "money is integer kobo (conventions.md canon)"
            if bad:
                conflict("format-canon", rname, "%s.%s: %s" % (rname, fname, why),
                         [{"src": s["src"], "quote": "%s: %s" % (fname, s["type"])} for s in bad[:3]],
                         ["ISO-8601 UTC string per canon (needs a supersede for the as-built form)", "keep as built"])

    # ------------------------------------------------------------ step 4: truth check
    truth_naira = set()
    for t in truths:
        for m in NAIRA_RE.findall(t["statement"]):
            truth_naira.add(int(m.replace(",", "")))
    if any(re.search(r"\bfree\b", t["statement"]) for t in truths):
        truth_naira.add(0)
    pb = sources.get("price-book", {}).get("data", {}).get("seed", {})
    for p in pb.get("prices", []):
        for k in ("listKobo", "promoKobo"):
            if p.get(k):
                truth_naira.add(p[k] // 100)
    naira_seen = defaultdict(list)
    skip_files = [(pat, d_["id"]) for d_ in decisions for pat in (d_.get("truthSkipDataFiles") or [])]
    truth_skipped = []
    for sid in order:
        if sources[sid]["kind"] != "screen":
            continue
        by = sorted(set(did for pat, did in skip_files for f in screens.get(sid, {}).get("dataFiles", []) if fnmatch.fnmatch(f, pat)))
        if by:
            truth_skipped.append((sid, by[0]))
            continue
        for m in NAIRA_RE.findall(sources[sid]["text"]):
            v = int(m.replace(",", ""))
            if v not in truth_naira and sid not in naira_seen[v]:
                naira_seen[v].append(sid)
    for v in sorted(naira_seen):
        srcs = []
        for sid in naira_seen[v][:3]:
            txt = sources[sid]["text"]
            i = txt.find("₦%s" % format(v, ","))
            if i < 0:
                i = txt.find("₦" + str(v))
            srcs.append({"src": sid, "quote": txt[max(0, i - 60): i + 40] if i >= 0 else "₦%s" % v})
        conflict("truth-mismatch", "money", "₦%s shown or sent by a screen is in no product truth and not in the price book seed" % format(v, ","),
                 srcs + [{"src": "product-truths.json", "quote": "no truth states ₦%s" % format(v, ",")}],
                 ["owner gives the figure", "screen literal is stale (supersede)"])
    for t in truths:
        m = re.search(r"status values are ([a-z ,\-]+?) and ([a-z\-]+)", t["statement"])
        if not m:
            continue
        allowed = set(x.strip() for x in m.group(1).split(",")) | {m.group(2).strip()}
        words = set(re.findall(r"[a-z]+", t["statement"].lower()))
        for rname in sorted(res):
            if rname.lower() not in words or "status" not in res[rname]["fields"]:
                continue
            for s in res[rname]["fields"]["status"]["seen"]:
                lits = set(re.findall(r"'([a-z\-]+)'", s["type"] or ""))
                extra = sorted(lits - allowed)
                if extra and sources[s["src"]]["kind"] == "screen":
                    conflict("truth-mismatch", rname, "%s.status has %s, not in %s" % (rname, extra, t["id"]),
                             [{"src": s["src"], "quote": "status: %s" % s["type"]}, {"src": t["id"], "quote": t["statement"][:200]}],
                             ["truth wins", "add a supersede"])

    # ------------------------------------------------------------ step 5: endpoints
    decl_actions = {}
    for sid in order:
        if sources[sid]["kind"] != "declaration":
            continue
        for a in sources[sid]["data"].get("actions", []):
            rname, emb, _ = canon_entity(a["entity"], sid)
            if rname and rname not in ("@client", "@web"):
                decl_actions.setdefault((rname, a["name"]), (sid, a))
    named_kind = {}
    for sid in order:
        for a in sources[sid]["data"].get("actions", []):
            rname, emb, _ = canon_entity(a["entity"], sid)
            if rname and rname not in ("@client", "@web") and not emb:
                named_kind.setdefault((rname, strip_paren(a["name"])), a.get("kind", "custom"))
    endpoints = {}  # (method, path) -> ep
    mapping = []  # every action -> result

    def side_auth(sid, roles_override=None):
        d = sources[sid]["data"]
        ac = d.get("authContext", {}) or {}
        roles = roles_override if roles_override is not None else ac.get("rolesObserved", [])
        out = set()
        if roles_override is None and not ac.get("requiresAuth", True):
            out.add("public")
        for r in roles:
            rl = r.lower()
            word = rl.split(" ")[0].split("(")[0]
            if word in STAFF_ROLES and not rl.startswith("owner of") and sources[sid]["kind"] == "declaration":
                out.add("staff:" + word)
            elif "receiver" in rl or word == "public" or "anonymous" in rl:
                out.add("public")
            elif "business" in rl:
                out.add("role:business")
            elif "creator" in rl:
                out.add("role:creator")
            elif "owner of" in rl:
                out.add("user:owner")
            elif "staff" in rl:
                out.add("staff:any")
            elif word in STAFF_ROLES:
                out.add("staff:" + word)
            else:
                out.add("user")
        if not out:
            out.add("user" if ac.get("requiresAuth", True) else "public")
        return out

    def rebase(rname, path):
        b = routes.get("bases", {}).get(rname)
        if not b or path.startswith("port:") or "#" in path:
            return path
        for old in (route_base(rname), "/v1/admin" + route_base(rname)[3:]):
            if path == old or path.startswith(old + "/"):
                if path.startswith("/v1/admin"):
                    return path
                rest = path[len(old):]
                if b.get("singleton"):
                    rest = re.sub(r"^/:id", "", rest)
                elif b.get("idParam"):
                    rest = re.sub(r"^/:id", "/" + b["idParam"], rest)
                return b["base"] + rest
        return path

    def route_auth(names):
        return set(names)

    def ep_for(rname, aname, kind, sid, a):
        note = a.get("note") or ""
        # declaration of the same action decides the route
        dk = decl_actions.get((rname, aname))
        if dk and dk[0] != sid:
            return ep_for(rname, aname, dk[1]["kind"], dk[0], dk[1])
        m = PATH_RE.search(note)
        roles = a.get("roles")
        auth = side_auth(sid, roles if roles else None)
        if not roles and sources[sid]["kind"] == "declaration":
            rest = set(x for x in auth if not x.startswith("staff:"))
            auth = rest or {"user" if (sources[sid]["data"].get("authContext") or {}).get("requiresAuth", True) else "public"}
            if re.search(r"\bpublic\b|no auth|no account", note):
                auth = {"public"}
        if roles and not ({"public"} & set(roles)):
            auth = set(x for x in auth if x.startswith("staff:") or x.startswith("role:"))
        hdrs = [p["name"] for p in a.get("payload", []) if "signature" in p["name"].lower()]
        if hdrs or re.search(r"webhook|deliveryReceipt", aname, re.I) or "signature checked" in note:
            auth = {"webhook-signature"}
        if re.search(r"\binternal\b|not a public route|job after", note, re.I) and not m:
            auth = {"internal"}
        base = route_base(rname)
        staff_only = auth and all(x.startswith("staff:") for x in auth)
        if staff_only:
            base = "/v1/admin" + base[3:]
        if m:
            method, path = m.group(1), m.group(2)
        elif "internal" in auth:
            method, path = "INTERNAL", base.replace("/v1/", "port:") + "#" + aname
        elif kind == "create":
            method, path = "POST", base
        elif kind == "delete":
            method, path = "DELETE", base + "/:id"
        elif kind == "update" and aname.lower().startswith(GENERIC_UPDATE):
            method, path = "PATCH", base + "/:id"
        elif re.match(r"^(get|list)[A-Z]", aname):
            rest = kebab(re.sub(r"^(get|list)", "", aname))
            mine = rest.startswith("my-")
            rest2 = rest[3:] if mine else rest
            single = (a.get("expectedResponse") or {}).get("cardinality") == "single"
            rk = kebab(rname)
            last = rk.split("-")[-1]
            if rest2 in (rk, plural(rk), last, plural(last)) or rk.startswith(rest2 + "-"):
                method, path = "GET", base + ("/:id" if single and not mine else "")
            else:
                method, path = "GET", base + "/" + rest
        else:
            method, path = "POST", base + "/:id/" + kebab(aname)
        if not m:
            path = rebase(rname, path)
        return method, path, auth

    def add_ep(rname, method, path, auth, sid, label, body=None, response=None, status=None):
        key = (method, path)
        ep = endpoints.setdefault(key, {"resource": rname, "method": method, "path": path, "auth": set(),
                                        "authBy": defaultdict(set), "body": {}, "sources": [], "response": None,
                                        "status": "derived", "notes": set()})
        ep["auth"] |= auth
        for x in auth:
            ep["authBy"][x].add(sid)
        ep["sources"].append({"src": sid, "via": label})
        for p in body or []:
            ep["body"].setdefault(p["name"], {"type": p.get("type"), "from": set()})["from"].add(sid)
        if response and not ep["response"]:
            ep["response"] = response
        if status:
            ep["notes"].add(status)
        return key

    def ruled_removed(sid, a):
        toks = camel_tokens(a["name"])[1:]
        for s in sup:
            if s["targetState"].lower().startswith("removed") and sid in sup_match[s["id"]]:
                if toks and all(t in s["asBuilt"].lower() for t in toks):
                    return s["id"]
        return None

    for sid in order:
        src = sources[sid]
        for a in src["data"].get("actions", []):
            raw_entity, raw_name = a["entity"], a["name"]
            ref = {"src": sid, "entity": raw_entity, "action": raw_name, "provenance": src["kind"]}
            note = a.get("note") or ""
            rname, emb, ali = canon_entity(raw_entity, sid)
            rt = routes.get("actions", {}).get("%s:%s.%s" % (sid, raw_entity, raw_name))
            if rt is None and rname and rname not in ("@client", "@web"):
                aal0 = aliases["actions"].get("%s.%s" % (rname, raw_name))
                ck = aal0["canonical"] if aal0 else "%s.%s" % (rname, strip_paren(raw_name))
                rt = routes.get("actions", {}).get(ck)
            if rt and rt.get("ruling"):
                mapping.append(dict(ref, result="ruling", target=rt["ruling"]))
                continue
            if rname == "@web" and ali and ali.get("decision"):
                mapping.append(dict(ref, result="ruling", target=ali["decision"]))
                continue
            if rt:
                aal0 = aliases["actions"].get("%s.%s" % (rname, raw_name)) if rname else None
                res_rt = rt.get("resource") or ((aal0["canonical"].split(".")[0]) if aal0 else rname)
                if res_rt in (None, "@client", "@web"):
                    res_rt = "Account"
                _, _, auth_rt = ep_for(res_rt, strip_paren(raw_name), a.get("kind", "custom"), sid, a)
                if rt.get("auth"):
                    auth_rt = route_auth(rt["auth"])
                body = [dict(p, name=((emb + ".") if emb and not p["name"].startswith(emb) else "") + p["name"]) for p in a.get("payload", [])]
                key = add_ep(res_rt, rt["method"], rt["path"], auth_rt, sid, "action:%s (route %s)" % (raw_name, rt.get("decision", "")),
                             body=body, response=a.get("expectedResponse"))
                endpoints[key]["notes"].add("route by " + rt.get("decision", "routes.json"))
                mapping.append(dict(ref, result="endpoint", target=key))
                continue
            # ruled by a decision through a localStorage key it names
            keys = set(re.findall(r"fw-[a-z\-]+", note))
            ruled = None
            for dcs in decisions:
                if keys and any(k in dcs["decision"] for k in keys) and (rname == "@client" or CLIENT_ONLY.search(note)):
                    ruled = dcs["id"]
                    break
            if not ruled:
                ruled = ruled_removed(sid, a)
            if ruled:
                mapping.append(dict(ref, result="ruling", target=ruled))
                continue
            if rname is None:
                c = [x for x in conflicts if x["kind"] == "unclassified-entity" and x["entity"] == raw_entity]
                mapping.append(dict(ref, result="conflict", target=c[0]))
                continue
            if rname in ("@client", "@web") or (CLIENT_ONLY.search(note) and not re.search(r"\btoday\b", note)):
                c = conflict("client-only-action", rname if rname != "@client" else raw_entity,
                             "%s.%s asks for no server call; no endpoint derived. Needs a ruling that it stays in the browser, or a fragment that names the server need" % (raw_entity, raw_name),
                             [{"src": sid, "quote": note or raw_entity}], ["stays client-only (ruling)", "needs an endpoint"])
                mapping.append(dict(ref, result="conflict", target=c))
                continue
            akey = "%s.%s" % (rname, raw_name)
            aal = aliases["actions"].get(akey)
            if aal:
                rname2, aname = aal["canonical"].split(".", 1)
            else:
                rname2, aname = rname, strip_paren(raw_name)
            if re.match(r"^[a-z][a-z0-9]*(-[a-z0-9]+)+$", aname):  # hyphenated is one action (DEC-115)
                aname = re.sub(r"-([a-z0-9])", lambda m_: m_.group(1).upper(), aname)
            if not re.match(r"^[A-Za-z][A-Za-z0-9]*$", aname):
                c = conflict("unparseable-action", rname, "action name %r is not one action" % raw_name,
                             [{"src": sid, "quote": raw_name + ": " + note[:160]}], ["split into actions in the fragment"])
                mapping.append(dict(ref, result="conflict", target=c))
                continue
            kind = a.get("kind", "custom")
            if aal and aname in ("create", "update"):
                kind = aname
            if rname2 != rname or aal:
                da = decl_actions.get((rname2, aname))
                if da:
                    kind = da[1]["kind"]
                elif (rname2, aname) in named_kind:
                    kind = named_kind[(rname2, aname)]
            if emb and kind in ("update", "create"):
                kind = "update"
                aname = "update" if not aname.lower().startswith(GENERIC_UPDATE) else aname
            method, path, auth = ep_for(rname2, aname, kind, sid, a)
            body = [dict(p, name=((emb + ".") if emb and not p["name"].startswith(emb) else "") + p["name"]) for p in a.get("payload", [])]
            key = add_ep(rname2, method, path, auth, sid, "action:" + raw_name + (" -> " + aal["canonical"] if aal else ""),
                         body=body, response=a.get("expectedResponse"))
            if aal and aal.get("supersede"):
                endpoints[key]["notes"].add("alias by " + aal["supersede"])
            if ali and ali.get("supersede"):
                endpoints[key]["notes"].add("embedded by " + ali["supersede"])
            mapping.append(dict(ref, result="endpoint", target=key))

    # screen reads -> GET (dedupe: one endpoint per resource and cardinality; declared GET wins)
    declared_gets = defaultdict(list)
    for (m_, p_), ep in endpoints.items():
        if m_ == "GET" and any(sources[s["src"]]["kind"] == "declaration" for s in ep["sources"]):
            declared_gets[ep["resource"]].append((m_, p_))
    read_drops = []
    for rq in read_reqs:
        rname = rq["resource"]
        single = rq["cardinality"] == "single"
        rr = routes.get("reads", {})
        rt = rr.get("%s:%s" % (rq["src"], rq["entity"])) or rr.get("%s:*" % rq["src"]) or rr.get(rname)
        if rt and rt.get("drop"):
            read_drops.append((rq["src"], rq["entity"], rt["drop"]))
            continue
        auth = side_auth(rq["src"])
        if rt:
            if rt.get("auth"):
                auth = route_auth(rt["auth"])
            k_ = add_ep(rt.get("resource", rname), rt["method"], rt["path"], auth, rq["src"], "read:%s (route %s)" % (rq["entity"], rt.get("decision", "")),
                        response={"entity": rname, "cardinality": rq["cardinality"]})
            endpoints[k_]["notes"].add("route by " + rt.get("decision", "routes.json"))
            continue
        if declared_gets.get(rname):
            key = sorted(declared_gets[rname])[0]
            method, path = key
        else:
            method, path = "GET", rebase(rname, route_base(rname) + ("/:id" if single else ""))
        add_ep(rname, method, path, auth, rq["src"], "read:" + rq["entity"],
               response={"entity": rname, "cardinality": rq["cardinality"]})

    for ek, ov in sorted(routes.get("endpointAuth", {}).items()):
        m_, p_ = ek.split(" ", 1)
        if (m_, p_) in endpoints:
            ep = endpoints[(m_, p_)]
            ep["auth"] = route_auth(ov["auth"])
            ep["authBy"] = defaultdict(set, {x: {ov["decision"]} for x in ov["auth"]})
            ep["notes"].add("auth by " + ov["decision"])
    delivers = defaultdict(list)
    for x in routes.get("extraEndpoints", []):
        if x["decision"] not in [d_["id"] for d_ in decisions]:
            continue
        R(x["resource"])
        k_ = add_ep(x["resource"], x["method"], x["path"], route_auth(x["auth"]), x["decision"], "ruling:" + x["decision"])
        sources.setdefault(x["decision"], {"kind": "decision", "data": {}, "text": ""})
        for it in x.get("delivers", []):
            delivers[it].append(k_)
    ful = routes.get("fulfilment")
    if ful and ful["decision"] in [d_["id"] for d_ in decisions]:
        sources.setdefault(ful["decision"], {"kind": "decision", "data": {}, "text": ""})
        for p in sources.get("price-book", {}).get("data", {}).get("seed", {}).get("prices", []):
            k_ = add_ep(ful["resource"], "INTERNAL", "port:fulfilment#" + p["sku"], {"internal"}, ful["decision"], "ruling:%s fulfilment of %s" % (ful["decision"], p["sku"]))
            endpoints[k_]["notes"].add("runs on a verified payment (webhook); a replayed webhook adds nothing")
            delivers[p["sku"]].append(k_)

    # bodies a decision rules (routes.json endpointBody): drop fields, set fields, name the response
    # an endpointBody value may be a list of rulings (each with its own decision), applied in order (INT-3: the seal route has three)
    for ek, ovs in sorted(routes.get("endpointBody", {}).items()):
        for ov in (ovs if isinstance(ovs, list) else [ovs]):
            if ov["decision"] not in dec_ids:
                continue
            m_, p_ = ek.split(" ", 1)
            if (m_, p_) not in endpoints:
                print("HALT: routes.json endpointBody names %s, which no source makes" % ek)
                sys.exit(3)
            ep = endpoints[(m_, p_)]
            for n in ov.get("drop", []):
                ep["body"].pop(n, None)
            for n, t in ov.get("set", {}).items():
                # a retyped field keeps the sources that send it (so a field every source sends stays required)
                ep["body"][n] = {"type": t, "from": set(ep["body"].get(n, {}).get("from", set())) | {ov["decision"]}}
            # `require` names fields every source of the endpoint now sends, so the contract makes them required (INT-3: version)
            for n in ov.get("require", []):
                ep["body"][n]["from"] |= set(s_["src"] for s_ in ep["sources"])
            if "response" in ov:
                ep["response"] = ov["response"]
            ep["notes"].add("body by " + ov["decision"])

    # A14: reason on every changing admin request
    if REASON_DECISION not in [d_["id"] for d_ in decisions]:
        print("HALT: %s (the admin reason rule) is not in decisions.json" % REASON_DECISION)
        sys.exit(4)
    for key in sorted(endpoints):
        if key[1].startswith("/v1/admin") and key[0] not in ("GET", "INTERNAL") and key not in ADMIN_SIGNIN:
            ep = endpoints[key]
            if "reason" not in ep["body"]:
                ep["body"]["reason"] = {"type": "string (4 or more characters; written to the audit row)", "from": {REASON_DECISION}}
                ep["notes"].add("reason by " + REASON_DECISION)

    # supersedes that name a route rule the endpoint they cover
    sup_routes = {}
    for s in sup:
        for m in PATH_RE.findall(s["targetState"]) + [("GET", p) for p in re.findall(r"GET (/v1/[A-Za-z0-9_:\-/]+)", s["targetState"])]:
            sup_routes[m[1]] = s["id"]

    # static ruling: resources read only by static screens and named by no supersede route
    for rname in sorted(res):
        r = res[rname]
        if r["decls"] or not r["screens"]:
            continue
        provs = set(screens.get(s, {}).get("dataProvenance") for s in r["screens"])
        if provs <= {"static"}:
            covered = [sup_routes[ep["path"]] for ep in endpoints.values() if ep["resource"] == rname and ep["path"] in sup_routes]
            if covered:
                continue
            c = conflict("static-ruling", rname, "%s is read only by static screens (scan-map); serve from the API or keep local in the web app" % rname,
                         [{"src": s, "quote": "dataProvenance static"} for s in sorted(r["screens"])[:4]],
                         ["serve from the API", "keep local"])
            for ep in endpoints.values():
                if ep["resource"] == rname:
                    ep["notes"].add("pending static-ruling")

    # role contradictions
    for key in sorted(endpoints):
        ep = endpoints[key]
        a = ep["auth"]
        bad = None
        if "public" in a and any(x.startswith("staff:") for x in a):
            bad = "public and staff-only"
        elif "public" in a and "user:owner" in a and key[1].endswith("/:id"):
            bad = "public and owner-only on one record"
        if "webhook-signature" in a and len(a) > 1:
            bad = "webhook and user roles"
        if bad:
            conflict("role-contradiction", ep["resource"], "%s %s: %s" % (key[0], key[1], bad),
                     [{"src": s, "quote": x} for x in sorted(a) for s in sorted(ep["authBy"][x])[:2]],
                     sorted(a))

    # ------------------------------------------------------------ step 7: ui-align tasks
    tasks = []
    for s in sup:
        hits = sup_match[s["id"]]
        if not hits and not sup_field_apply.get(s["id"]):
            continue
        if s.get("wireVisible"):
            for scr in sorted(hits):
                tasks.append({"kind": "supersede", "bornFrom": s["id"], "screenId": scr, "files": hits[scr],
                              "change": s["targetState"], "status": "open"})
    for sid in order:
        if sources[sid]["kind"] != "screen":
            continue
        d = sources[sid]["data"]
        handled = d.get("uiStatesHandled", [])
        seen = set()
        for st in d.get("uiStatesDesigned", []):
            tok = st.lower()
            ok = [h for h in handled if tok in re.split(r"[^a-z]+", h.get("state", "").lower()) and h.get("reachable") != "no"]
            if not ok and tok not in seen:
                seen.add(tok)
                tasks.append({"kind": "designed-state", "bornFrom": "design:%s·%s" % (sid, st), "screenId": sid,
                              "files": screens.get(sid, {}).get("uiFiles", [])[:3], "change": "implement the designed %s state" % st,
                              "enterCondition": {"loading": "a request for this surface is in flight (conventions Runtime contract)",
                                                 "empty": "the server returns no items",
                                                 "error": "the request fails; show retry",
                                                 "offline": "connectivity source reports offline"}.get(tok, "as designed: " + st),
                              "status": "open"})
        for h in handled:
            if h.get("reachable") == "no":
                st = h.get("state", "")
                if st.lower() in seen:
                    continue
                seen.add(st.lower())
                tasks.append({"kind": "designed-state", "bornFrom": "unreachable:%s·%s" % (sid, st), "screenId": sid,
                              "files": screens.get(sid, {}).get("uiFiles", [])[:3],
                              "change": "make the coded state reachable: %s" % st, "enterCondition": h.get("entersWhen", ""),
                              "status": "open"})
    for st in stubs:
        if st.get("resolution") in ("implemented", "deferred-by-user", "not-a-stub"):
            continue
        tasks.append({"kind": "stub", "bornFrom": st["id"], "screenId": (st.get("seenBy") or [None])[0],
                      "files": [st.get("file")], "change": "replace: %s" % st.get("standsInFor", ""),
                      "status": "open"})
    trig = re.search(r"Refresh triggers:([^\n]+)", conventions)
    trig = trig.group(1).strip() if trig else "none named in conventions.md"
    for sc in scan["screens"]:
        ls = sc.get("localStore")
        if ls and ls.get("populatedBy") is None and sc.get("dataProvenance") in ("repository-local-store", "mixed"):
            tasks.append({"kind": "populate-path", "bornFrom": "screen:" + sc["id"], "screenId": sc["id"],
                          "files": sc.get("dataFiles", []), "change": "the server populates what this screen reads (%s); triggers: %s" % (ls.get("reads", "")[:120], trig),
                          "status": "open", "provenance": sc["dataProvenance"]})
    for i, t in enumerate(tasks, 1):
        t["id"] = "UA-%d" % i
    tasks = [dict([("id", t["id"])] + [(k, v) for k, v in t.items() if k != "id"]) for t in tasks]

    # stale supersedes
    for s in sup:
        if not sup_match[s["id"]] and not sup_field_apply.get(s["id"]):
            conflict("stale-supersede", s["id"], "supersede matches no screen evidence", [{"src": s["id"], "quote": s["asBuilt"][:200]}],
                     ["re-check the evidence path", "retire the supersede"])
        elif s.get("wireVisible") and not any(t["bornFrom"] == s["id"] for t in tasks):
            conflict("stale-supersede", s["id"], "wireVisible supersede produced no ui-align task", [{"src": s["id"], "quote": s["asBuilt"][:200]}])

    # ------------------------------------------------------------ dep graph
    lower = {n.lower(): n for n in res}
    edges = defaultdict(set)
    for rname in sorted(res):
        for fname in res[rname]["fields"]:
            m = re.match(r"^([a-z][A-Za-z]*?)Ids?$", fname.split(".")[-1])
            nr = aliases.get("notReferences", {}).get("%s.%s" % (rname, fname))
            if m and not (nr and nr["decision"] in dec_ids):
                tgt = lower.get(m.group(1).lower())
                if tgt and tgt != rname:
                    edges[rname].add(tgt)
    first = set()
    for d in IDENTITY_DECL + MONEY_DECL:
        if d in sources:
            for rd in sources[d]["data"].get("reads", []):
                n, _, _ = canon_entity(rd["entity"], d)
                if n and n not in ("@client", "@web"):
                    first.add(n)
    if "Account" in res:
        first.add("Account")
    stack = list(first)
    while stack:
        n = stack.pop()
        for t in edges.get(n, ()):
            if t not in first:
                first.add(t)
                stack.append(t)
    waves, done = [], set()
    cyc = []

    def layer(group):
        remaining = set(group)
        while remaining:
            ready = sorted(n for n in remaining if all(t in done or t not in res for t in edges.get(n, ())))
            if not ready:
                cyc.append(sorted(remaining))
                ready = sorted(remaining)
            waves.append(ready)
            done.update(ready)
            remaining -= set(ready)
    layer(first)
    layer(set(res) - first)
    for c in cyc:
        conflict("cycle", " / ".join(c), "dependency cycle among %s" % ", ".join(c), [{"src": "dep-graph", "quote": n + " -> " + ",".join(sorted(edges[n]))} for n in c])

    # ------------------------------------------------------------ number conflicts
    for i, c in enumerate(conflicts, 1):
        c["id"] = "C-%d" % i
    conflicts_out = [dict([("id", c["id"])] + [(k, v) for k, v in c.items() if k != "id"]) for c in conflicts]

    # ------------------------------------------------------------ registry
    field_types = {}
    for d_ in decisions:
        for fk, ft in sorted((d_.get("fieldTypes") or {}).items()):
            field_types[fk] = (ft, d_["id"])
    field_nullable = set()
    for d_ in decisions:
        field_nullable |= set(d_.get("fieldNullable") or [])
    ep_keys = sorted(endpoints, key=lambda k: (endpoints[k]["resource"], k[1], k[0]))
    # Endpoint ids are stable across a reopen (INT-1): an endpoint keeps the id the registry gave it; a new endpoint takes the
    # next free number, in sorted order. A first run (no registry yet) numbers in sorted order.
    old_ids = {}
    if os.path.exists(os.path.join(PIPE, "registry.json")):
        for r_ in load("registry.json").get("resources", []):
            for e_ in r_.get("endpoints", []):
                old_ids[(e_["method"], e_["path"])] = e_["id"]
    ep_id = {k: old_ids[k] for k in ep_keys if k in old_ids}
    next_n = max([int(v[2:]) for v in ep_id.values()] + [0]) + 1
    for k in ep_keys:
        if k not in ep_id:
            ep_id[k] = "E-%d" % next_n
            next_n += 1

    def auth_label(a):
        out = []
        staff = sorted(set(r_ for x in a if x.startswith("staff:") for r_ in (STAFF_ROLES if x == "staff:any" else [x[6:]])))
        for x in sorted(a):
            if x == "public":
                out.append({"kind": "public"})
            elif x == "user" or x == "user:owner":
                out.append({"kind": "user", "scope": "own records" if x == "user:owner" else "signed in"})
            elif x.startswith("role:"):
                out.append({"kind": "role", "role": x[5:]})
            elif x.startswith("staff:"):
                if staff:
                    out.append({"kind": "staff role", "roles": staff})
                    staff = []
            elif x == "webhook-signature":
                out.append({"kind": "webhook signature"})
            elif x == "internal":
                out.append({"kind": "internal", "note": "queue job or port; no HTTP route"})
            elif x == "cookie":
                out.append({"kind": "cookie", "note": "public by its httpOnly refresh cookie; no bearer (DEC-152)"})
        return out

    registry = {"version": 1, "frozenAt": None, "framework": framework.get("framework"),
                "generatedBy": "tools/pipeline/reconcile.py", "resources": [], "sharedShapes": {
                    "PaginatedList<T>": "{ items: T[], nextCursor: string | null } with ?cursor=&limit= (conventions.md)",
                    "ErrorEnvelope": "{ error: { code, message, fields?, requestId } } (conventions.md)"}}
    # fields a decision takes off a resource's shape (routes.json dropFields: a secret the reader must never get)
    dropped = set("%s.%s" % (x["resource"], x["name"]) for x in routes.get("dropFields", []) if x["decision"] in dec_ids)
    for rname in sorted(res):
        r = res[rname]
        fields = []
        for fname in sorted(r["fields"]):
            if "%s.%s" % (rname, fname) in dropped:
                continue
            f = r["fields"][fname]
            classes = sorted(set(s["class"] for s in f["seen"]))
            fams = families(classes, fname)
            ann = []
            for sid_ in sorted(f["supersedes"]):
                ann.append("%s: %s" % (sid_, sup_by_id[sid_]["targetState"]))
            row_f = {"name": fname, "type": (fams[0] if fams else classes[0]) if len(fams) <= 1 else "CONFLICT:" + "|".join(fams),
                     "classes": classes, "nullable": (True in f["nullable"]),
                     "provenance": sorted(set(s["src"] for s in f["seen"])), "supersedes": ann}
            # HM4 (DEC-215): a field the sources give named children (content.cover, makerNote.chosen, ...) is an object, whatever
            # class a bare mention of it carried (Wish.content was typed text from an enum and a named-type mention)
            if any(k.startswith(fname + ".") or k.startswith(fname + "[") for k in r["fields"]) and row_f["type"] != "object":
                row_f["type"] = "object"
            if "%s.%s" % (rname, fname) in field_types:
                row_f["type"], row_f["typeBy"] = field_types["%s.%s" % (rname, fname)]
            # HP4 (DEC-219): a decision may rule a field nullable (Wish.no is null until a wish is sealed)
            if "%s.%s" % (rname, fname) in field_nullable:
                row_f["nullable"] = True
            fields.append(row_f)
        eps = []
        for k in ep_keys:
            ep = endpoints[k]
            if ep["resource"] != rname:
                continue
            eps.append({"id": ep_id[k], "method": ep["method"], "path": ep["path"], "auth": auth_label(ep["auth"]),
                        "body": [{"name": n, "type": ep["body"][n]["type"], "from": sorted(ep["body"][n]["from"])} for n in sorted(ep["body"])],
                        "response": ep["response"], "sources": sorted(ep["sources"], key=lambda s: (s["src"], s["via"])),
                        "notes": sorted(ep["notes"])})
        registry["resources"].append({"name": rname, "sourceScreens": sorted(r["screens"]), "sourceDeclarations": sorted(r["decls"]),
                                      "embedded": [{"from": a, "field": b} for a, b in sorted(r["embedded"])],
                                      "fields": fields, "endpoints": eps})

    # ------------------------------------------------------------ entitlements
    def joined(text):
        ws = camel_tokens(text)
        return set(ws) | set(a + b for a, b in zip(ws, ws[1:]))

    def enum_tokens(rname):
        out = set()
        for fname, f in res.get(rname, {}).get("fields", {}).items():
            if fname == "purpose":
                for s_ in f["seen"]:
                    for lit in re.split(r"[|(),]", s_["type"] or "")[1:]:
                        out |= joined(lit)
        return out
    purchase_toks = {}
    vocab = []
    for k in ep_keys:
        ep = endpoints[k]
        rt = camel_tokens(ep["resource"])
        toks = set(["".join(rt), rt[0]]) if len(rt) > 1 else set(rt)
        money_res = any(any(x["class"] == "money-kobo" for x in f["seen"]) for f in res[ep["resource"]]["fields"].values())
        if ep["method"] == "POST" and money_res and "webhook-signature" not in ep["auth"] and enum_tokens(ep["resource"]):
            purchase_toks[k] = enum_tokens(ep["resource"])
        for s in ep["sources"]:
            v = s["via"].split(":", 1)[1].split(" -> ")
            for part in v:
                toks |= set(camel_tokens(part.split(".")[-1]))
        vocab.append((k, toks))
    ents = []
    decl_truth = defaultdict(set)
    for sid in order:
        if sources[sid]["kind"] == "declaration":
            for t in sources[sid]["data"].get("truths") or []:
                decl_truth[t].add(sid)

    def k_is_ruled(k):
        return any(s_["via"].startswith("ruling:") for s_ in endpoints[k]["sources"])

    def match_eps(text, decls):
        words = joined(text)
        hits = []
        for k, toks in vocab:
            ep = endpoints[k]
            if k[0] == "GET" or k in purchase_toks:
                continue
            common = sorted((words & toks) - WEAK)
            by_decl = any(s["src"] in decls for s in ep["sources"])
            if common or by_decl:
                hits.append((0 if by_decl else 1, -len(common), ep_id[k], k, common, by_decl))
        hits.sort()
        best = min((h[1] for h in hits if not h[5]), default=0)
        hits = [h for h in hits if h[5] or (h[1] == best and h[1] <= -1)]
        return hits[:8]
    items = [(t["id"], "truth", t["statement"]) for t in truths if t["kind"] == "entitlement"]
    items += [(p["sku"], "price-book", p["name"] + " " + p["sku"].replace(".", " ")) for p in pb.get("prices", [])]
    for iid, kind, text in items:
        hits = [(0, 0, ep_id[k], k, [], True) for k in sorted(delivers.get(iid, []))] + match_eps(text, decl_truth.get(iid, set()))
        words = joined(text)
        buy = sorted("%s %s" % k for k, pt in purchase_toks.items() if (words & pt) - WEAK)
        row = {"id": iid, "source": kind, "statement": text, "purchase": buy,
               "endpoints": [{"endpoint": h[2], "route": "%s %s" % h[3], "matchedBy": ("ruling " + ful["decision"] if ful and k_is_ruled(h[3]) else "declaration cites it") if h[5] else "words: " + ", ".join(h[4])} for h in hits]}
        if ful and iid in (ful.get("tests") or {}):
            row["proves"] = ful["tests"][iid]
        if hits:
            res0 = endpoints[hits[0][3]]["resource"]
            row["test"] = "src/%s/tests/%s.contract.spec.ts > entitlement %s" % (kebab(res0), kebab(res0), iid)
        else:
            c = conflict("entitlement-without-endpoint", iid, "sold or promised (%s) but no endpoint delivers it%s" % (kind, (" (it can be bought: %s)" % ", ".join(buy)) if buy else ""),
                         [{"src": "price-book" if kind == "price-book" else "product-truths.json", "quote": text[:200]}],
                         ["build the endpoint", "stop selling it"])
            c["id"] = "C-%d" % (len(conflicts_out) + 1)
            conflicts_out.append(dict([("id", c["id"])] + [(k2, v) for k2, v in c.items() if k2 != "id"]))
            row["conflict"] = c["id"]
        ents.append(row)

    # ------------------------------------------------------------ field flow + metrics
    def actor_of(a):
        out = set()
        for x in a:
            if x == "public":
                out.add("public")
            elif x.startswith("staff:"):
                out.add("staff")
            elif x == "role:business":
                out.add("business")
            elif x == "role:creator":
                out.add("creator")
            elif x in ("user", "user:owner"):
                out.add("person")
            elif x == "webhook-signature":
                out.add("provider")
            elif x == "internal":
                out.add("server")
        return out
    flows = []
    metrics = []
    for rname in sorted(res):
        r = res[rname]
        store = rname
        for fname in sorted(r["fields"]):
            f = r["fields"][fname]
            writers, wactors = [], set()
            for k in ep_keys:
                ep = endpoints[k]
                if ep["resource"] == rname and fname in ep["body"]:
                    writers.append(ep_id[k])
                    wactors |= actor_of(ep["auth"])
            decl_src = sorted(set(s["src"] for s in f["seen"] if sources[s["src"]]["kind"] == "declaration"))
            if not writers and decl_src:
                writers = ["server:" + d for d in decl_src]
                wactors.add("server")
            readers, ractors = [], set()
            for s in sorted(set(s["src"] for s in f["seen"] if sources[s["src"]]["kind"] == "screen")):
                readers.append(s)
                ractors |= actor_of(side_auth(s))
            row = {"field": "%s.%s" % (rname, fname), "writers": writers, "store": store, "readers": readers,
                   "writerActors": sorted(wactors), "readerActors": sorted(ractors),
                   "crossActor": bool(wactors and ractors and (ractors - wactors) and "server" not in wactors),
                   "noWriter": not writers}
            flows.append(row)
            classes = set(s["class"] for s in f["seen"] if sources[s["src"]]["kind"] == "screen")
            if readers and classes & {"number", "integer", "money-kobo", "money-naira", "money-number"} and canon_kind(fname) != "id":
                toks = set(camel_tokens(fname))
                formula = [t["id"] for t in truths if t["kind"] in ("metric", "pricing") and toks & set(camel_tokens(t["statement"]))][:4]
                wording = [x for x in (s.get("note") for s in []) if x]
                for s in f["seen"]:
                    if sources[s["src"]]["kind"] == "screen":
                        wording.append("%s: %s" % (s["src"], s["type"]))
                wp = writers[:]
                if "money-kobo" in classes and any(s_ in f["supersedes"] for s_ in [sup_class.get("money", ("",))[0]]):
                    wp.append("price book (S-14: the web reads GET /v1/prices)")
                mrow = {"metric": "%s.%s" % (rname, fname), "shownOn": readers, "writerPath": wp,
                        "formula": formula, "wording": wording[:3], "noWriter": not wp}
                if not wp:
                    mrow["owed"] = True
                    mrow["owedEvent"] = owed_tab.get("byMetric", {}).get(mrow["metric"]) or owed_tab.get("byResource", {}).get(rname)
                metrics.append(mrow)

    # ------------------------------------------------------------ mapping check
    def tgt_id(m):
        if m["result"] == "endpoint":
            return ep_id[m["target"]]
        if m["result"] == "conflict":
            return m["target"]["id"]
        return m["target"]
    unmapped = [m for m in mapping if m["result"] not in ("endpoint", "conflict", "ruling")]
    for m in mapping:
        m["target"] = tgt_id(m)

    # ------------------------------------------------------------ write outputs
    closed_log = []
    by_key = {}
    for row in conflicts_out:
        by_key.setdefault(row["key"], []).append(row)
    for d_ in decisions:
        for cl in d_.get("closes") or []:
            rows = by_key.get(cl["key"])
            if rows:
                for row in rows:
                    row["status"] = "closed"
                    row["closedBy"] = d_["id"]
                    row["round1Id"] = cl.get("conflict")
                closed_log.append((cl.get("conflict"), d_["id"], "raised and closed"))
            else:
                kind_, ent_, det_ = cl["key"].split("|", 2)
                row = {"id": "C-%d" % (len(conflicts_out) + 1), "kind": kind_, "entity": ent_, "detail": cl.get("detail", det_),
                       "key": cl["key"], "sources": [], "options": [], "status": "closed", "closedBy": d_["id"],
                       "round1Id": cl.get("conflict"), "note": "no longer raised: the ruling was applied to the inputs"}
                conflicts_out.append(row)
                by_key[cl["key"]] = [row]
                closed_log.append((cl.get("conflict"), d_["id"], "applied, no longer raised"))
    open_rows = [c for c in conflicts_out if c["status"] == "open"]
    by_kind = defaultdict(int)
    for c in conflicts_out:
        by_kind[c["kind"]] += 1
    dump("registry.json", registry)
    dump("dep-graph.json", {"edges": [{"from": n, "to": sorted(edges[n])} for n in sorted(edges)],
                            "waves": waves, "firstGroup": sorted(first),
                            "rule": "identity and money resources (declarations %s) and what they reference come first; then topological layers" % ", ".join(IDENTITY_DECL + MONEY_DECL)})
    dump("conflicts.json", {"conflicts": conflicts_out, "countsByKind": dict(sorted(by_kind.items())),
                            "open": len(open_rows), "closed": len(conflicts_out) - len(open_rows)})
    tk = defaultdict(int)
    for t in tasks:
        tk[t["kind"]] += 1
    dump("ui-align-tasks.json", {"tasks": tasks, "countsByKind": dict(sorted(tk.items()))})
    dump("entitlements.json", {"entitlements": ents, "withoutEndpoint": sorted(e["id"] for e in ents if not e["endpoints"])})
    dump("field-flow.json", {"fields": flows, "crossActor": sum(1 for f in flows if f["crossActor"]),
                             "noWriter": sum(1 for f in flows if f["noWriter"])})
    owed_groups = defaultdict(list)
    for m in metrics:
        if m.get("owed"):
            owed_groups[m["owedEvent"] or "NO EVENT NAMED"].append(m["metric"])
    dump("metrics.json", {"metrics": metrics, "noWriter": sorted(m["metric"] for m in metrics if m["noWriter"]),
                          "owedByEvent": {k: sorted(v) for k, v in sorted(owed_groups.items())}})

    n_ep = len(endpoints)
    L = ["# Reconcile log", "", "Generated by tools/pipeline/reconcile.py. Deterministic; re-run after fragments change.", "",
         "## Counts", "",
         "- sources: %d screen fragments, %d declarations" % (sum(1 for s in sources.values() if s["kind"] == "screen"), sum(1 for s in sources.values() if s["kind"] == "declaration")),
         "- resources: %d" % len(res), "- endpoints: %d" % n_ep,
         "- waves: %d" % len(waves),
         "- conflicts: %d (%s)" % (len(conflicts_out), ", ".join("%s %d" % kv for kv in sorted(by_kind.items()))),
         "- ui-align tasks: %d (%s)" % (len(tasks), ", ".join("%s %d" % kv for kv in sorted(tk.items()))),
         "- entitlements: %d, without endpoint %d" % (len(ents), sum(1 for e in ents if not e["endpoints"])),
         "- metrics: %d, without writer %d" % (len(metrics), sum(1 for m in metrics if m["noWriter"])),
         "- actions: %d; to endpoint %d, to conflict %d, to ruling %d; unmapped %d" % (
             len(mapping), sum(1 for m in mapping if m["result"] == "endpoint"), sum(1 for m in mapping if m["result"] == "conflict"),
             sum(1 for m in mapping if m["result"] == "ruling"), len(unmapped)),
         "- open conflicts: %d; closed by a decision: %d" % (len(open_rows), len(conflicts_out) - len(open_rows)),
         "- declarations deferred by the owner (skipped): %s" % (", ".join("%s (%s)" % d_ for d_ in deferred) or "none"),
         "- reads dropped by a ruling: %s" % (", ".join("%s %s (%s)" % x for x in read_drops) or "none"),
         "- screens skipped by the money truth check (sample data): %s" % (", ".join("%s (%s)" % x for x in truth_skipped) or "none"),
         "", "## Supersedes", ""]
    for s in sup_all:
        if s.get("supersededBy"):
            L.append("- %s replaced by %s (not applied)" % (s["id"], s["supersededBy"]))
    for s in sup:
        hits = sup_match[s["id"]]
        st = "applied" if hits or sup_field_apply.get(s["id"]) else "UNMATCHED"
        L.append("- %s %s: %d screens%s%s" % (s["id"], st, len(hits),
                                             (", %d fields transformed" % sup_field_apply[s["id"]]) if sup_field_apply.get(s["id"]) else "",
                                             (" (" + ", ".join(sorted(hits)) + ")") if hits else ""))
    L += ["", "## Actions ruled by a recorded decision or supersede", ""]
    for m in mapping:
        if m["result"] == "ruling":
            L.append("- %s %s.%s -> %s" % (m["src"], m["entity"], m["action"], m["target"]))
    L += ["", "## Action map", "", "| source | entity | action | result |", "|---|---|---|---|"]
    for m in mapping:
        L.append("| %s | %s | %s | %s %s |" % (m["src"], m["entity"].replace("|", "/"), m["action"].replace("|", "/"), m["result"], m["target"]))
    L += ["", "## Conflicts closed by decisions", ""]
    for c_, d_, how in closed_log:
        L.append("- %s -> %s (%s)" % (c_, d_, how))
    L += ["", "## Owed metrics (no writer yet)", ""]
    for k, v in sorted(owed_groups.items()):
        L.append("- %s: %s" % (k, ", ".join(sorted(v))))
    L += ["", "## Waves", ""]
    for i, w in enumerate(waves, 1):
        L.append("- wave %d: %s" % (i, ", ".join(w)))
    with open(os.path.join(PIPE, "reconcile-log.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")

    no_auth = [ep_id[k] for k in ep_keys if not endpoints[k]["auth"]]
    print("resources %d endpoints %d waves %d conflicts %d tasks %d" % (len(res), n_ep, len(waves), len(conflicts_out), len(tasks)))
    print("conflicts by kind: " + ", ".join("%s %d" % kv for kv in sorted(by_kind.items())))
    print("tasks by kind: " + ", ".join("%s %d" % kv for kv in sorted(tk.items())))
    print("entitlements without endpoint: %d; metrics without writer: %d" % (sum(1 for e in ents if not e["endpoints"]), sum(1 for m in metrics if m["noWriter"])))
    print("UNMAPPED ACTIONS: %d" % len(unmapped))
    print("ENDPOINTS WITHOUT AUTH: %d" % len(no_auth))
    print("OPEN CONFLICTS: %d" % len(open_rows))
    for c in open_rows:
        print("  open %s %s %s: %s" % (c["id"], c["kind"], c["entity"], c["detail"][:110]))
    no_ent = [e["id"] for e in ents if not e["endpoints"]]
    adm_keys = [k for k in ep_keys if k[1].startswith("/v1/admin")]
    no_reason = ["%s %s" % k for k in adm_keys if k[0] not in ("GET", "INTERNAL") and k not in ADMIN_SIGNIN and "reason" not in endpoints[k]["body"]]
    no_staff = ["%s %s" % k for k in adm_keys if k not in ADMIN_PUBLIC and not (
        endpoints[k]["auth"] and all(x.startswith("staff:") for x in endpoints[k]["auth"]))]
    print("ADMIN ACTIONS WITHOUT REASON: %d%s" % (len(no_reason), (" (" + ", ".join(no_reason) + ")") if no_reason else ""))
    print("ADMIN ENDPOINTS WITHOUT STAFF ROLE: %d%s" % (len(no_staff), (" (" + ", ".join(no_staff) + ")") if no_staff else ""))
    return 0 if not unmapped and not no_auth and not open_rows and not no_ent and not no_reason and not no_staff else 1


if __name__ == "__main__":
    sys.exit(main())
