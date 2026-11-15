#!/usr/bin/env python3
"""Generates prisma/schema.prisma and the shared contracts package (src/contracts/**) from the frozen registry.

Inputs (read-only): .pipeline/registry.json, .pipeline/declared/*.json, .pipeline/field-flow.json, .pipeline/dep-graph.json,
and .pipeline/schema-map.json (the schema step's classification and per-resource column rulings).
Run: python3 tools/pipeline/gen_schema.py   (then `npx prisma format` and the migration step in the README of prisma/)
"""
import json
import re
from collections import OrderedDict, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
P = ROOT / ".pipeline"
REG = json.loads((P / "registry.json").read_text())
FLOW = json.loads((P / "field-flow.json").read_text())["fields"]
DEP = json.loads((P / "dep-graph.json").read_text())
MAP = json.loads((P / "schema-map.json").read_text())["resources"]

RES = OrderedDict((r["name"], r) for r in REG["resources"])
EPS = {e["id"]: (r["name"], e) for r in REG["resources"] for e in r["endpoints"]}
IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
PATH = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)((?:\.[A-Za-z_][A-Za-z0-9_]*|\[[A-Za-z_]\w*\])+)\??$")
ENUM_IN = re.compile(r"enum\(([^)]*)\)")
TYPE_NAMES = {"string", "number", "boolean", "undefined", "null", "object", "array"}
LIT_UNION = re.compile(r"^\s*'?[A-Za-z0-9_.-]+'?(\s*\|\s*'?[A-Za-z0-9_.-]+'?)+\s*$")

assert set(MAP) == set(RES), f"schema-map must classify every resource: missing {set(RES) - set(MAP)}, extra {set(MAP) - set(RES)}"
# tables a ruling adds that are no registry resource (schema-map 'joinTables', Y5 in INT-2): storage only, no contract shape
JOIN = json.loads((P / "schema-map.json").read_text()).get("joinTables", {})
assert not set(JOIN) & set(RES), "a join table must not share a resource's name"

# ---------------------------------------------------------------- declarations
DECL = defaultdict(OrderedDict)  # entity -> name -> field
for p in sorted((P / "declared").glob("*.json")):
    d = json.loads(p.read_text())
    if d.get("status") == "deferred-by-owner":
        continue  # skipped as reconcile.py skips it (R11: no SMS or WhatsApp)
    for rd in d.get("reads", []):
        for f in rd.get("fields", []):
            prev = DECL[rd["entity"]].get(f["name"])
            if prev and ENUM_IN.search(prev["type"]) and ENUM_IN.search(f["type"]):
                a = ENUM_IN.search(prev["type"]).group(1).split("|")
                b = ENUM_IN.search(f["type"]).group(1).split("|")
                f = dict(f, type="enum(" + "|".join(a + [x for x in b if x not in a]) + ")")
            DECL[rd["entity"]][f["name"]] = f

# a field type a decision rules (registry typeBy) wins over the declared type (DEC-135: channel is enum(email))
for _r in REG["resources"]:
    _ent = MAP[_r["name"]].get("declaredAs", _r["name"])
    for _f in _r["fields"]:
        if _f.get("typeBy") and _f["name"] in DECL.get(_ent, {}) and ENUM_IN.search(_f["type"]):
            DECL[_ent][_f["name"]] = dict(DECL[_ent][_f["name"]], type=_f["type"])

# ---------------------------------------------------------------- writers (a GET's query parameters do not write)
def is_write(w: str) -> bool:
    if w.startswith("server:"):
        return True
    return w in EPS and EPS[w][1]["method"] != "GET"

WRITTEN = {x["field"] for x in FLOW if any(is_write(w) for w in x["writers"])}


def ident(name: str) -> bool:
    return bool(IDENT.match(name))


def root_of(name: str):
    if ident(name):
        return name
    m = PATH.match(name)
    return m.group(1) if m else None


def pascal(s: str) -> str:
    parts = re.split(r"[^A-Za-z0-9]+", s)
    return "".join(p[:1].upper() + p[1:] for p in parts if p)


def snake(s: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", s).lower()


def camel(s: str) -> str:
    return s[:1].lower() + s[1:]


# ---------------------------------------------------------------- enum values for a field
def body_union(res: str, field: str):
    for e in RES[res]["endpoints"]:
        for b in e["body"]:
            if b["name"] == field:
                t = re.sub(r"\(.*\)", "", b["type"]).strip()
                if LIT_UNION.match(t):
                    return [v.strip().strip("'") for v in t.split("|")]
    return None


def enum_values(res: str, f: dict, decl: dict | None):
    if decl and ENUM_IN.search(decl["type"]):
        return ENUM_IN.search(decl["type"]).group(1).split("|")
    if decl:
        return None
    m = ENUM_IN.search(f["type"])
    if m and "array" not in f["type"]:
        return [v for v in m.group(1).split("|") if v != "null"]
    if "enum" in f["classes"]:
        return body_union(res, f["name"])
    return None


# ---------------------------------------------------------------- stored models
STORED = {n for n, m in MAP.items() if m["class"] in ("table", "config") or (m["class"] == "document" and m["host"].split(".")[0] == n)}
ENUMS: "OrderedDict[str, list]" = OrderedDict()


def enum_name(model: str, field: str, values: list) -> str:
    name = model + pascal(field)
    ENUMS[name] = values
    return name


def prisma_type(model: str, name: str, f: dict | None, decl: dict | None):
    """Returns (type, attrs, kind) for one column."""
    t = (decl or {}).get("type") or (f or {}).get("type", "string")
    classes = (f or {}).get("classes", [])
    vals = enum_values(model, f or {"name": name, "type": t, "classes": []}, decl)
    if vals:
        if t.startswith("array<enum"):
            return enum_name(model, name, vals) + "[]", "", "enum-list"
        return enum_name(model, name, vals), "", "enum"
    money = "money-kobo" in classes or t == "money" or (t == "integer" and name.lower().endswith("kobo"))
    if money:
        return "BigInt", "", "money"
    if name == "id" or (name.endswith("Id") and t in ("string",)):
        return "String", "@db.Uuid" if name == "id" else "", "string"
    if t in ("datetime",) or t.startswith("time"):
        return "DateTime", "@db.Timestamptz(3)", "time"
    if t in ("date", "date-only"):
        return "DateTime", "@db.Date", "date"
    if t in ("integer", "number") or "integer" in classes:
        if name in ("bytes", "size"):
            return "BigInt", "", "int"
        return "Int", "", "int"
    if t == "boolean":
        return "Boolean", "", "bool"
    if t == "array<string>":
        return "String[]", "", "list"
    if t in ("string", "decimal-string") or (t.startswith("string")):
        return "String", "", "string"
    return "Json", "", "json"


def model_columns(name: str):
    m = MAP[name]
    r = RES[name]
    decl = DECL.get(m.get("declaredAs", name), {})
    omit = dict(m.get("omit", {}))
    for g in ("reason", "action"):
        if g not in decl:
            omit.setdefault(g, "an admin action input, written to the audit row (DEC-125)")
    alias = m.get("alias", {})
    cols: "OrderedDict[str, dict]" = OrderedDict()
    cols["id"] = {"type": "String", "attrs": "@id @db.Uuid", "opt": False, "kind": "id"}
    regf = {f["name"]: f for f in r["fields"]}
    declared_names = list(decl.keys())
    if m["class"] == "document":
        # A document keeps its owner, state and times as columns and the whole as validated JSON.
        keep = [f["name"] for f in r["fields"] if ident(f["name"]) and (f["name"] in ("status", "createdAt", "updatedAt", "submittedAt", "liveAt") or f["name"].endswith("Id"))]
        names = keep
    else:
        names = declared_names[:]
        for f in r["fields"]:
            fn = f["name"]
            if fn in names:
                continue
            if not decl or f"{name}.{fn}" in WRITTEN or fn in m.get("keep", {}):
                names.append(fn)
    roots_added = set()
    for fn in names:
        if fn in omit or fn in alias or fn == "id":
            continue
        rt = root_of(fn)
        if rt is None:
            continue  # reader prose, not a field name
        if rt != fn:
            if rt in names or rt in roots_added or rt in omit or rt in alias:
                continue
            roots_added.add(rt)
            cols[rt] = {"type": "Json", "attrs": "", "opt": True, "kind": "json"}
            continue
        d = decl.get(fn)
        f = regf.get(fn)
        if fn in m.get("types", {}):  # a ruled type wins before any enum is named for the column
            typ, attrs, kind = m["types"][fn], "", "json" if m["types"][fn] == "Json" else "string"
        else:
            typ, attrs, kind = prisma_type(name, fn, f, d)
        opt = d["nullable"] if d else True
        if fn in m.get("nullable", []):
            opt = True
        if fn in m.get("required", []):
            opt = False  # a decision names the field as always present (schema-map 'required')
        if fn in ("createdAt", "updatedAt"):
            typ, kind = "DateTime", "time"
        if fn in ("createdAt",):
            opt = False
            attrs = "@default(now()) @db.Timestamptz(3)"
        if fn == "updatedAt":
            opt = False
            attrs = "@updatedAt @db.Timestamptz(3)"
        if typ.endswith("[]"):
            opt = False
            attrs = "@default([])"
        cols[fn] = {"type": typ, "attrs": attrs, "opt": opt, "kind": kind}
    for a, target in alias.items():
        if target not in cols and target != "id" and root_of(a) == a:
            typ, attrs, kind = prisma_type(name, target, regf.get(a), decl.get(target))
            if target in ("createdAt",):
                typ, attrs, kind = "DateTime", "@default(now()) @db.Timestamptz(3)", "time"
            cols[target] = {"type": typ, "attrs": attrs, "opt": target != "createdAt", "kind": kind}
    if m["class"] == "document":
        cols["document"] = {"type": "Json", "attrs": "", "opt": False, "kind": "json"}
    # storage columns a ruling adds that no registry field carries (schema-map 'columns': type, attrs, opt, why)
    for c, v in m.get("columns", {}).items():
        typ = v["type"]
        if ENUM_IN.match(typ):
            typ = enum_name(name, c, ENUM_IN.match(typ).group(1).split("|"))
        cols[c] = {"type": typ, "attrs": v.get("attrs", ""), "opt": v.get("opt", True), "kind": v.get("kind", "ruled")}
    # calendar dates are DATE columns (C-29, Q4)
    for c in m.get("dates", []):
        assert c in cols, f"{name}.{c}: schema-map dates names a column the model does not have"
        cols[c].update(type="DateTime", attrs="@db.Date", kind="date")
    for c, a in m.get("dbTypes", {}).items():
        assert c in cols, f"{name}.{c}: schema-map dbTypes names a column the model does not have"
        cols[c]["attrs"] = a
    return cols


MODELS = OrderedDict((n, model_columns(n)) for n in RES if n in STORED)
for _n, _m in JOIN.items():
    MAP[_n] = dict(_m, **{"class": "table"})
    _cols: "OrderedDict[str, dict]" = OrderedDict()
    _cols["id"] = {"type": "String", "attrs": "@id @db.Uuid", "opt": False, "kind": "id"}
    for _c, _v in _m["columns"].items():
        _t = _v["type"]
        if ENUM_IN.match(_t):
            _t = enum_name(_n, _c, ENUM_IN.match(_t).group(1).split("|"))
        _cols[_c] = {"type": _t, "attrs": _v.get("attrs", ""), "opt": _v.get("opt", True), "kind": "ruled"}
    MODELS[_n] = _cols
for n, m in MAP.items():
    if m["class"] == "document" and m["host"].split(".")[0] != n:
        host_model, host_col = m["host"].split(".")
        assert host_col in MODELS[host_model], f"{n}: host {m['host']} missing"

# ---------------------------------------------------------------- relations (dep-graph edges between stored models)
RELS = []  # (from, to, column)
for edge in DEP["edges"]:
    a = edge["from"]
    if a not in MODELS:
        continue
    for b in edge["to"]:
        if b not in MODELS or b in MAP[a].get("skipEdges", {}):
            continue
        col = camel(b) + "Id"
        cols = MODELS[a]
        if col not in cols:
            cols[col] = {"type": "String", "attrs": "", "opt": True, "kind": "fk"}
        cols[col]["type"] = "String"
        cols[col]["attrs"] = "@db.Uuid"
        cols[col]["kind"] = "fk"
        RELS.append((a, b, col))
for a, m in MAP.items():
    for b in m.get("owner", []):
        col = camel(b) + "Id"
        cols = MODELS[a]
        if col not in cols:
            cols[col] = {"type": "String", "attrs": "@db.Uuid", "opt": not m.get("ownerRequired", False), "kind": "fk"}
        cols[col]["attrs"] = "@db.Uuid"
        cols[col]["kind"] = "fk"
        if (a, b, col) not in RELS:
            RELS.append((a, b, col))
# id columns that point at another table under their own name (schema-map 'refs': column -> model; Q10)
for a, m in MAP.items():
    for col, b in m.get("refs", {}).items():
        cols = MODELS[a]
        assert col in cols and b in MODELS, f"{a}.{col} -> {b}: schema-map refs names a missing column or model"
        cols[col]["type"] = "String"
        cols[col]["attrs"] = "@db.Uuid"
        cols[col]["kind"] = "fk"
        if (a, b, col) not in RELS:
            RELS.append((a, b, col))
# columns named <x>Id that are not relations still hold UUIDv7 ids
for n, cols in MODELS.items():
    for c, v in cols.items():
        if c.endswith("Id") and v["type"] == "String" and not v["attrs"] and c not in ("eventId", "providerReference", "journalId", "requestId", "subjectId", "fileId"):
            pass

# ---------------------------------------------------------------- indexes: list filters, cursors, foreign keys
INDEXES = defaultdict(list)
for a, b, col in RELS:
    INDEXES[a].append([col, "id"])
for n in MODELS:
    for e in (RES[n]["endpoints"] if n in RES else []):
        if e["method"] != "GET":
            continue
        for b in e["body"]:
            c = MAP[n].get("alias", {}).get(b["name"], b["name"])
            if c in MODELS[n] and c != "id" and not any(c in u and len(u) == 1 for u in MAP[n].get("unique", [])):
                INDEXES[n].append([c, "id"])
    for c in ("status", "state"):
        if c in MODELS[n] and MODELS[n][c]["kind"] == "enum":
            INDEXES[n].append([c, "id"])
    for ix in MAP[n].get("indexes", []):  # indexes a ruling asks for (schema-map 'indexes')
        assert all(c in MODELS[n] for c in ix), f"{n}: schema-map indexes names a column the model does not have"
        INDEXES[n].append(list(ix))
    if "createdAt" in MODELS[n] and n in ("LedgerEntry", "AuditEntry", "Event", "Payment", "MessageDelivery", "Notice", "JobRun", "WishTransition", "WebhookEvent"):
        INDEXES[n].append(["createdAt", "id"])

# ---------------------------------------------------------------- write prisma/schema.prisma
def render_schema() -> str:
    out = [
        "// Firstwish database schema. Generated by tools/pipeline/gen_schema.py from the frozen registry, the declarations,",
        "// dep-graph.json and .pipeline/schema-map.json. Do not edit by hand: change schema-map.json (a ruling) and generate again.",
        "// Ids are UUIDv7 issued by the server; money is BigInt kobo; times are timestamptz UTC; calendar dates are date.",
        "",
        "generator client {",
        '  provider = "prisma-client-js"',
        "}",
        "",
        "datasource db {",
        '  provider = "postgresql"',
        '  url      = env("DATABASE_URL")',
        "}",
        "",
    ]
    back = defaultdict(list)
    for a, b, col in RELS:
        back[b].append((a, col))
    for n, cols in MODELS.items():
        m = MAP[n]
        out.append(f"/// {m['class']}: {m['reason']}")
        out.append(f"model {n} {{")
        for c, v in cols.items():
            q = "?" if v["opt"] and not v["type"].endswith("[]") else ""
            out.append(f"  {c} {v['type']}{q} {v['attrs']}".rstrip())
        multi = defaultdict(int)
        for a, b, col in RELS:
            if a == n:
                multi[b] += 1
        for a, b, col in RELS:
            if a != n:
                continue
            rel = f'"{a}_{col}"'
            stem = col[:-2] if col.endswith("Id") else col + "Ref"
            field = stem if stem not in cols else stem + "Ref"
            q = "?" if cols[col]["opt"] else ""
            od = m.get("refOnDelete", {}).get(col, m.get("onDelete"))
            rule = f", onDelete: {od}, onUpdate: {od}" if od else ""
            out.append(f"  {field} {b}{q} @relation({rel}, fields: [{col}], references: [id]{rule})")
        for a, col in back[n]:
            one = [col] in MAP[a].get("unique", [])
            stem = col[:-2] if col.endswith("Id") else col
            out.append(f'  {camel(a)}By{pascal(stem)} {a}{"?" if one else "[]"} @relation("{a}_{col}")')
        for u in m.get("unique", []):
            out.append(f"  @@unique([{', '.join(u)}])")
        seen = set()
        for ix in INDEXES[n]:
            k = tuple(ix)
            if k in seen:
                continue
            seen.add(k)
            out.append(f"  @@index([{', '.join(ix)}])")
        out.append(f'  @@map("{snake(n)}")')
        out.append("}")
        out.append("")
    for en, vals in ENUMS.items():
        out.append(f"enum {en} {{")
        for v in vals:
            idn = re.sub(r"[^A-Za-z0-9_]", "_", v)
            if not idn or idn[0].isdigit():
                idn = "v_" + idn
            out.append(f'  {idn} @map("{v}")' if idn != v else f"  {v}")
        out.append("}")
        out.append("")
    return "\n".join(out)


(ROOT / "prisma/schema.prisma").write_text(render_schema())

# ================================================================ contracts
TS_SCALAR = {
    "money": "Kobo", "time": "Instant", "date-only": "DateOnly", "number": "number", "integer": "number",
    "boolean": "boolean", "string": "string", "object": "Record<string, unknown>", "array": "unknown[]",
    "unknown": "unknown", "named": "unknown", "array<string>": "string[]",
}


def ts_field_type(res: str, f: dict) -> str:
    t = f["type"]
    if f["name"] in MAP[res].get("dates", []):
        return "DateOnly"  # a calendar date (C-29, Q4)
    if t.startswith("integer (kobo"):
        return "Kobo"
    if t.startswith("integer ("):
        return "number"
    if t.startswith("string ("):
        return "string"
    if t.startswith("time"):
        return "Instant"
    if t in TS_SCALAR:
        base = TS_SCALAR[t]
    elif t == "kobo-or-time":
        return "Kobo | Instant"  # X15 (DEC-162): kobo for kind naira, an instant for kind date
    elif t.startswith("object {url, method, headers, expiresAt}"):
        return "SignedUpload"  # X20 (DEC-163)
    elif t.startswith("object {active: boolean, endsAt: time}"):
        return "{ active: boolean; endsAt: Instant } | null"
    elif t.startswith("array<enum("):
        vals = ENUM_IN.search(t).group(1).split("|")
        return "Array<" + " | ".join(json.dumps(v) for v in vals) + ">"
    elif t.startswith("enum("):
        vals = ENUM_IN.search(t).group(1).split("|")
        return " | ".join("null" if v == "null" else json.dumps(v) for v in vals)
    else:
        base = "unknown"
    if t == "string" and "enum" in f["classes"]:
        d = DECL.get(res, {}).get(f["name"])
        vals = enum_values(res, f, d)
        if vals:
            return " | ".join(json.dumps(v) for v in vals)
    if t == "number" and "money-number" in f["classes"]:
        return "number"
    return base


def prop(name: str) -> str:
    return name if ident(name) else json.dumps(name)


def resource_interface(r: dict) -> str:
    lines = [f"/** {r['name']}: {MAP[r['name']]['class']}. {MAP[r['name']]['reason']} */", f"export interface {r['name']} {{"]
    tree: "OrderedDict[str, OrderedDict]" = OrderedDict()
    plain = OrderedDict()
    for f in r["fields"]:
        rt = root_of(f["name"])
        if rt is None:
            continue
        if rt == f["name"]:
            plain[rt] = f
        else:
            tree.setdefault(rt, OrderedDict())[f["name"]] = f
    for n, f in plain.items():
        q = "?" if f["nullable"] else ""
        t = ts_field_type(r["name"], f)
        if f["nullable"] and "null" not in t and t != "unknown":
            t = f"{t} | null"
        lines.append(f"  {prop(n)}{q}: {t};")
    for rt, sub in tree.items():
        if rt in plain:
            continue
        lines.append(f"  {rt}?: Record<string, unknown> | null;")
    lines.append("}")
    return "\n".join(lines)


SPECIAL_RESP = {
    "None": "void", "none": "void", "Empty": "Empty", "true": "true", "link string": "string", "string link (clipboard, local)": "string",
    "OrderRow": "ConciergeOrder", "PayoutRow": "Payout", "Member": "StaffAccount", "Staff": "StaffAccount", "ModView": "Report",
    "PublishView": "PublishedWish", "Listed": "PublishedWish", "Submission": "StyleSubmission", "ThreadDetail": "SupportThread",
    "Delivery": "MessageDelivery", "StyleRow": "Style", "Brand": 'Business["brand"]', "Payment (new state)": "Payment", "VideoOrder": "RenderJob",
    "SubmittedStyle": "SubmittedStyle", "StyleChange": "StyleChange", "SignInCode": "SignInCode", "InvoiceFile": "InvoiceFile",
    "HandleCheck {free:boolean, problem?:string}": "HandleCheck", "FollowResponse {handle,following:false}": "FollowResponse",
    "FollowResponse {handle,following:true}": "FollowResponse", "SaveResponse {saved:true,counts}": "SaveResponse",
    "SaveResponse {saved:false,counts}": "SaveResponse", "ReactResponse": "ReactResponse",
    "ReactResponse {reaction:Reaction|null,counts:{reactions,saves}}": "ReactResponse", "ShareResponse {url,title,text}": "ShareResponse",
    "{shoot:Shoot, wish:ClientWish}": "{ shoot: Shoot; wish: ClientWish }", "{shoot:Shoot, added:number, previews:number}": "ShootFilesAdded",
    "ok | {ok:false,error}": "UnlockResult", "none (navigation to /app/new)": "void",
    "StudioStyle (withdraw, back to draft) | SubmittedStyle (template)": "StudioStyle | SubmittedStyle",
    "AuthResult": "AuthResult", "StaffAuthResult": "StaffAuthResult", "GoogleStart": "GoogleStart",
    "TicketQuote": "TicketQuote", "PriceBook": "PriceBook",
    "WishSaved": "WishSaved", "PeopleImportResult": "PeopleImportResult",
}

SHARED_TYPES = '''/** A UUIDv7 id issued by the server. */
export type Id = string;
/** An instant on the wire: ISO-8601 UTC ("2026-11-15T14:30:00.000Z"). */
export type Instant = string;
/** A calendar date: "YYYY-MM-DD" (ruling C-29). */
export type DateOnly = string;
/** A whole number of kobo (NGN). Never a float, never a formatted string. */
export type Kobo = number;
export type Currency = "NGN";
/** Money on the wire where a field carries amount and currency together. */
export interface Money {
  amount: Kobo;
  currency: Currency;
}
/** Every list: ?cursor=&limit= (1 to 50, default 20). */
export interface PaginatedList<T> {
  items: T[];
  nextCursor: string | null;
}
export interface ListQuery {
  cursor?: string;
  limit?: number;
}
/** Every error. */
export interface ErrorEnvelope {
  error: { code: string; message: string; fields?: Record<string, string>; requestId: string };
}
/** A response with no body fields. */
export type Empty = Record<string, never>;
/** 204 No Content: an endpoint whose registry response is null answers with no body (Q12). */
export type NoContent = void;
/** What every payment start returns about the payment it opened (Q12, DEC-139). */
export interface PaymentStart {
  reference: string;
  state: Payment["status"];
  amountKobo: Kobo;
  /** The provider's checkout page the payer goes to. */
  authorizationUrl: string;
}
/** A payment start: the payment, beside what it buys (null until the verified payment fulfils it). */
export interface PaymentStarted<T> {
  payment: PaymentStart;
  item: T | null;
}
/** A start that may cost nothing (E-228: the Pass covers the keep): payment is null then. */
export interface PaymentStartedOrCovered<T> {
  payment: PaymentStart | null;
  item: T | null;
}

/** E-5. */
export interface HandleCheck {
  free: boolean;
  problem?: string;
}
/** E-57, E-58. */
export interface FollowResponse {
  handle: string;
  following: boolean;
}
/** E-155, E-156. */
export interface SaveResponse {
  saved: boolean;
  counts: Record<string, number>;
}
/** E-142, E-143. */
export interface ReactResponse {
  reaction: Reaction | null;
  counts: { reactions: number; saves: number };
}
/** E-166. */
export interface ShareResponse {
  url: string;
  title: string;
  text: string;
}
/** E-60: the invoice file. */
export interface InvoiceFile {
  name: string;
  type: "text/html";
  text: string;
}
/** E-171, E-172. */
export interface ShootFilesAdded {
  shoot: Shoot;
  added: number;
  previews: number;
}
/** E-134. */
export type UnlockResult = { ok: true } | { ok: false; error: string };
/** E-15, E-16 (shape in the registry note of E-15). */
export interface StyleChange {
  base?: string;
  theme?: unknown;
  scenes?: Record<string, unknown>;
  made?: unknown;
  tags?: unknown;
  ops?: unknown[];
  said: string[];
  credits: number;
}
/** E-20, E-53, E-159 (T1, DEC-150): a sign-in or a refresh. The refresh token is only in the httpOnly cookie. */
export interface AuthResult {
  /** The access token the web app keeps in memory only (R10). */
  accessToken: string;
  accessExpiresAt: Instant;
  /** true when this sign-in made the account (the web app shows Welcome). */
  isNew: boolean;
  session: { id: Id; expiresAt: Instant };
  /** E-53 only: the path the Google sign-in started from. */
  returnTo?: string;
}
/** E-176, E-234 (S5, DEC-148): a staff sign-in or a staff refresh. The refresh token is only in the httpOnly staff cookie. */
export interface StaffAuthResult {
  staff: StaffAccount;
  accessToken: string;
  accessTokenExpiresAt: Instant;
}
/** E-54 (T2, DEC-151): where the browser goes to sign in with Google. */
export interface GoogleStart {
  url: string;
}
/** A read that returns every row in ONE answer, no paging (X28, DEC-166): nextCursor is always null. */
export interface AllList<T> {
  items: T[];
  nextCursor: null;
}
/** UploadTicket.upload (X20, DEC-163): the signed PUT. It binds the content type and length (X26). */
export interface SignedUpload {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: Instant;
}
/** One priced line of a quote (X13, DEC-160). */
export interface QuoteLine {
  sku: string;
  name: string;
  qty: number;
  /** The list price of one. */
  listKobo: Kobo;
  /** The price charged for one at the quote's moment. */
  unitKobo: Kobo;
  /** unitKobo times qty. */
  totalKobo: Kobo;
  discounted: boolean;
}
/** E-213 (X13, DEC-160): ONE quote for a ticket and its extras, priced by the server from the price book. */
export interface TicketQuote {
  /** The price-book version the quote used. */
  version: number;
  versionId: Id;
  lines: QuoteLine[];
  totalKobo: Kobo;
  listTotalKobo: Kobo;
}
/** E-125 (X14, DEC-161): the public price book, paged by ?cursor=&limit=. */
export interface PriceBook {
  version: number;
  items: Price[];
  promotion: Promotion | null;
  lifecycle: LifecycleConfig | null;
  entitlements: Entitlements;
  nextCursor: string | null;
}
/** E-225 (CC1, DEC-170): a saved draft: the version to send with the next write, and when this one landed. */
export interface WishSaved {
  version: number;
  updatedAt: Instant;
}
/** One row an import left out (BB8, DEC-169): its position in the pasted rows (1 is the first) and why. */
export interface PeopleImportSkipped {
  row: number;
  reason: string;
}
/** E-121 (BB8, DEC-169): how many people were added and which rows were skipped. */
export interface PeopleImportResult {
  added: number;
  skipped: PeopleImportSkipped[];
}
/** E-19: the registry names the response SignInCode and gives no fields. */
export type SignInCode = Record<string, unknown>;
/** E-202 (DEC-65): a read view of a live StudioStyle with its submission. */
export type SubmittedStyle = StudioStyle & { submission?: StyleSubmission | null };
'''


def op_name(e: dict) -> str:
    if e["method"] == "INTERNAL":
        return "Internal" + pascal(e["path"].replace("port:", ""))
    segs = [s for s in e["path"].split("/") if s and s != "v1"]
    words = [("By" + pascal(s[1:])) if s.startswith(":") else pascal(s) for s in segs]
    return pascal(e["method"].lower()) + "".join(words)


# ---------------------------------------------------------------- body field -> TS type and class-validator decorators
def body_field(name: str, typ: str, required: bool):
    t = typ.strip()
    # A union of type NAMES ("string | undefined (...)") is not a set of values: undefined/null mean optional, the rest is the type.
    m = re.match(r"^\s*([a-z]+(?:\s*\|\s*[a-z]+)+)\s*(\(.*)?$", t)
    if m and all(x.strip() in TYPE_NAMES for x in m.group(1).split("|")):
        parts = [x.strip() for x in m.group(1).split("|")]
        rest = [x for x in parts if x not in ("undefined", "null")]
        if len(rest) == 1:
            t = rest[0] + (" " + m.group(2) if m.group(2) else "")
            if len(rest) < len(parts):
                required = False
    low = t.lower()
    decos = []
    imports = set()
    optional = (not required) or low.endswith("?") or "optional" in low or "| undefined" in low or "or ''" in low or "|''" in low
    ts = "unknown"
    core = re.sub(r"\s*\(.*$", "", t).strip()
    if name in ("email",) and low.startswith("string"):
        ts, decos = "string", ["IsCanonEmail()"]
    elif name == "handle" and low.startswith("string"):
        ts, decos = "string", ["IsCanonHandle()"]
    elif name in ("phone",) and low.startswith("string"):
        ts, decos = "string", ["IsCanonPhone()"]
    elif name == "contact" and low.startswith("string (email"):
        ts, decos = "string", ["IsCanonEmail()"]
    elif low.startswith("integer (kobo"):
        ts, decos = "Kobo", ["IsKobo()"] + (["Min(1)"] if "positive" in low else [])
    elif "yyyy-mm-dd" in low or core in ("date", "date?"):
        ts, decos = "DateOnly", ["IsDateOnly()"]
        if "''" in t:
            ts, decos = "DateOnly", ['ValidateIf((o: Record<string, unknown>) => o[%s] !== "")' % json.dumps(name), "IsDateOnly()"]
    elif core in ("boolean", "boolean?"):
        ts, decos = "boolean", ["IsBoolean()"]
    elif core == "true":
        ts, decos = "true", ["Equals(true)"]
    elif core in ("integer", "integer?") or low.startswith("number (1") or low.startswith("integer"):
        ts, decos = "number", ["IsInt()"]
    elif low.startswith("number[]"):
        ts, decos = "number[]", ["IsArray()", "IsInt({ each: true })"]
    elif low.startswith("number"):
        ts, decos = "number", ["IsNumber()"]
    elif core in ("array<string>",):
        ts, decos = "string[]", ["IsArray()", "IsString({ each: true })"]
    elif core.startswith("time") or core in ("datetime", "instant"):
        ts, decos = "Instant", ["IsInstant()"]
    elif LIT_UNION.match(core) and "|" in core:
        vals = [v.strip().strip("'") for v in core.split("|")]
        has_null = "null" in [v.strip() for v in core.split("|")]  # an unquoted null is the value null (CC1: keep)
        if has_null:
            vals = [v for v in vals if v != "null"]
            optional = True  # IsOptional lets null through
        ts = " | ".join(json.dumps(v) for v in vals) + (" | null" if has_null else "")
        decos = [f"IsIn({json.dumps(vals)})"]
    elif re.match(r"^'[^']+'$", core):
        v = core.strip("'")
        ts, decos = json.dumps(v), [f"IsIn({json.dumps([v])})"]
    elif low.startswith("string"):
        ts, decos = "string", ["IsString()"]
        m = re.search(r"(?:min|at least)\s*(\d+)|(\d+) or more", low)
        if m:
            decos.append(f"MinTrimmed({m.group(1) or m.group(2)})")
        m = re.search(r"max(?:length)?\s*(\d+)|<=\s*(\d+)", low)
        if m:
            decos.append(f"MaxLength({m.group(1) or m.group(2)})")
        if "non-empty" in low:
            decos.append("MinTrimmed(1)")
    elif low.startswith("array") or core.endswith("[]"):
        ts, decos = "unknown[]", ["IsArray()"]
    elif low.startswith("object") or core.startswith("{") or low.startswith("record"):
        ts, decos = "Record<string, unknown>", ["IsObject()"]
    else:
        ts, decos = "unknown", ["Allow()"]
    if optional:
        decos.insert(0, "IsOptional()")
    m = re.search(r"at least one of ([A-Za-z, ]+)\)", t)
    if m:
        group = [x.strip() for x in m.group(1).split(",")]
        decos.append(f"RequireOneOf({json.dumps(group)})")
    return ts, decos, optional, t


def split_body(e: dict):
    path_params = re.findall(r":([A-Za-z_]+)", e["path"])
    params, headers, fields, raw = [], [], [], False
    srcs = {s["src"] for s in e["sources"]}
    for b in e["body"]:
        n, t = b["name"], b["type"]
        if t.strip().lower().startswith("header"):
            headers.append(n)
            continue
        if n == "raw body":
            raw = True
            continue
        if n in path_params:
            params.append(n)
            continue
        if "(path)" in t or "(route)" in t:
            continue  # the path's own parameter under another name
        if not root_of(n):
            continue
        required = srcs.issubset(set(b["from"])) or len(srcs) <= 1
        fields.append((n, t, required))
    for pp in path_params:
        if pp not in params:
            params.append(pp)
    return params, headers, fields, raw


def response_type(e: dict) -> str:
    resp = e["response"] or {}
    ent = resp.get("entity")
    card = resp.get("cardinality") or ""
    if resp.get("paymentStart"):
        inner = ent if ent in RES else SPECIAL_RESP[ent]
        return f"PaymentStarted<{inner}>" if resp["paymentStart"] == "required" else f"PaymentStartedOrCovered<{inner}>"
    if ent is None:
        return "void"
    base = ent if ent in RES else SPECIAL_RESP.get(ent)
    if base is None and ent.startswith("void (resolves)"):
        base = "void"
    if base is None:
        raise SystemExit(f"HALT: {e['id']} response {ent!r} has no representation")
    if card == "list":
        return f"PaginatedList<{base}>"
    if card == "all":
        return f"AllList<{base}>"
    if card.startswith("count"):
        return "number"
    return base


ENDPOINT_ROWS = []
DTO_FILES = defaultdict(list)
TYPE_LINES = [
    "/*",
    " * Firstwish shared contracts: one shape per registry resource and one request and response per registry endpoint.",
    " * Generated by tools/pipeline/gen_schema.py from the frozen .pipeline/registry.json. Types only: no runtime imports, so the",
    " * web app can use contracts/firstwish-contracts.d.ts (npm run contracts:export) without importing the API.",
    " */",
    "",
    SHARED_TYPES,
]
for r in REG["resources"]:
    TYPE_LINES.append(resource_interface(r))
    TYPE_LINES.append("")

names_used = set()
for r in REG["resources"]:
    group = snake(r["name"]).replace("_", "-")
    for e in r["endpoints"]:
        op = op_name(e)
        if op in names_used:
            op = op + e["id"].replace("-", "")
        names_used.add(op)
        params, headers, fields, raw = split_body(e)
        is_query = e["method"] == "GET"
        bodyname = f"{op}{'Query' if is_query else 'Body'}"
        # nested dotted fields become one object field on their root
        flat = OrderedDict()
        for n, t, req in fields:
            rt = root_of(n)
            if rt != n:
                flat.setdefault(rt, (rt, "object (" + ", ".join(x for x, _, _ in fields if root_of(x) == rt) + ")", False))
            elif n not in flat:
                flat[n] = (n, t, req)
        doc = f"/** {e['id']} {e['method']} {e['path']}. Auth: " + "; ".join(
            a.get("role") or ",".join(a.get("roles", [])) or a.get("scope", "") or a["kind"] for a in e["auth"]) + ". */"
        TYPE_LINES.append(doc)
        TYPE_LINES.append(f"export interface {op}Params {{")
        for p_ in params:
            TYPE_LINES.append(f"  {p_}: string;")
        TYPE_LINES.append("}")
        TYPE_LINES.append(f"export interface {bodyname} {{")
        dto = [f"/** {e['id']} {e['method']} {e['path']} ({'query' if is_query else 'body'}). */", f"export class {bodyname}Dto implements {bodyname} {{"]
        used_decos = set()
        # a group of optional fields of which one must be sent: checked on the first field that is always sent
        one_of = sorted({d for n, t, req in flat.values() for d in body_field(n, t, req)[1] if d.startswith("RequireOneOf(")})
        anchor = next((n for n, t, req in flat.values() if not body_field(n, t, req)[2]), None)
        assert not one_of or anchor, f"{e['id']}: RequireOneOf needs a field that is always sent"
        for n, t, req in flat.values():
            ts, decos, opt, orig = body_field(n, t, req)
            decos = [d for d in decos if not d.startswith("RequireOneOf(")] + (one_of if n == anchor else [])
            q = "?" if opt else ""
            TYPE_LINES.append(f"  /** {orig.replace('*/', '*\\/')[:300]} */")
            TYPE_LINES.append(f"  {prop(n)}{q}: {ts};")
            for d in decos:
                dto.append(f"  @{d}")
                used_decos.add(d.split("(")[0])
            dto.append(f"  {prop(n)}{'?' if opt else '!'}: {ts};")
        if is_query and (e["response"] or {}).get("cardinality") in ("list", "page"):
            TYPE_LINES.append("  cursor?: string;")
            TYPE_LINES.append("  limit?: number;")
            dto += ["  @IsOptional()", "  @IsString()", "  cursor?: string;", "  @IsOptional()", "  @Type(() => Number)", "  @IsInt()", "  @Min(1)", "  @Max(50)", "  limit?: number;"]
            used_decos |= {"IsOptional", "IsString", "Type", "IsInt", "Min", "Max"}
        TYPE_LINES.append("}")
        dto.append("}")
        if params:
            dto.append(f"export class {op}ParamsDto implements {op}Params {{")
            for p_ in params:
                dto += ["  @IsString()", f"  {p_}!: string;"]
            used_decos.add("IsString")
            dto.append("}")
        TYPE_LINES.append(f"export interface {op}Headers {{")
        for h in headers:
            TYPE_LINES.append(f"  {json.dumps(h.lower())}: string;")
        TYPE_LINES.append("}")
        rtype = response_type(e)
        no_content = rtype == "void" and e["method"] != "INTERNAL"
        if no_content:
            TYPE_LINES.append("/** 204 No Content: the response has no body (Q12). */")
            rtype = "NoContent"
        TYPE_LINES.append(f"export type {op}Response = {rtype};")
        TYPE_LINES.append("")
        DTO_FILES[group].append(("\n".join(dto), used_decos))
        ENDPOINT_ROWS.append((e["id"], e["method"], e["path"], op, bodyname, r["name"], raw, no_content))

def collapse_empty(lines):
    out, i = [], 0
    while i < len(lines):
        m = re.match(r"^export interface (\w+) \{$", lines[i])
        if m and i + 1 < len(lines) and lines[i + 1] == "}":
            out.append(f"export type {m.group(1)} = Record<string, never>;")
            i += 2
            continue
        out.append(lines[i])
        i += 1
    return out


TYPE_LINES = collapse_empty(TYPE_LINES)
for g, items in DTO_FILES.items():
    DTO_FILES[g] = [(re.sub(r"(export class \w+) implements \w+ \{\n\}", r"\1 {}", d), u) for d, u in items]
TYPE_LINES.append("/** Every endpoint by registry id: its request parts and its response. */")
TYPE_LINES.append("export interface EndpointContracts {")
for eid, method, path, op, bodyname, res, raw, hp in ENDPOINT_ROWS:
    TYPE_LINES.append(f'  "{eid}": {{ params: {op}Params; {"query" if method == "GET" else "body"}: {bodyname}; headers: {op}Headers; response: {op}Response }};')
TYPE_LINES.append("}")
TYPE_LINES.append("export type EndpointId = keyof EndpointContracts;")

C = ROOT / "src/contracts"
(C / "dto").mkdir(parents=True, exist_ok=True)
for old in (C / "dto").glob("*.ts"):
    old.unlink()
(C / "types.ts").write_text("\n".join(TYPE_LINES) + "\n")

CV = {"IsOptional", "IsString", "IsInt", "IsNumber", "IsBoolean", "IsArray", "IsObject", "IsIn", "Equals", "MaxLength", "Min", "Max", "Allow", "ValidateIf"}
OWN = {"IsCanonEmail", "IsCanonHandle", "IsCanonPhone", "IsDateOnly", "IsInstant", "MinTrimmed", "IsKobo", "RequireOneOf"}
for group, items in DTO_FILES.items():
    used = set().union(*(u for _, u in items))
    types = sorted(set(re.findall(r"implements (\w+)", "\n".join(d for d, _ in items))))
    head = [f"// Request validation for {group} endpoints. Generated by tools/pipeline/gen_schema.py; do not edit by hand."]
    if used & CV:
        head.append(f'import {{ {", ".join(sorted(used & CV))} }} from "class-validator";')
    if "Type" in used:
        head.append('import { Type } from "class-transformer";')
    if used & OWN:
        head.append(f'import {{ {", ".join(sorted(used & OWN))} }} from "../../common/validation/decorators";')
    extra = sorted({t for t in ("DateOnly", "Instant", "Kobo") if re.search(rf"\b{t}\b", "\n".join(d for d, _ in items))})
    head.append(f'import type {{ {", ".join(types + extra)} }} from "../types";')
    (C / "dto" / f"{group}.ts").write_text("\n".join(head) + "\n\n" + "\n\n".join(d for d, _ in items) + "\n")

idx = ["// The shared contracts package: import every request, response and resource shape from here. Generated; do not edit by hand.", 'export * from "./types";', 'export * from "./endpoints";']
for group in sorted(DTO_FILES):
    idx.append(f'export * from "./dto/{group}";')
(C / "index.ts").write_text("\n".join(idx) + "\n")

ep = ["// Every registry endpoint with its contract names. Generated by tools/pipeline/gen_schema.py; do not edit by hand.",
      "export interface EndpointRow {", "  id: string;", "  method: string;", "  path: string;", "  resource: string;", "  operation: string;",
      "  request: string;", "  rawBody: boolean;", "  /** 204 with no body (Q12). */", "  noContent: boolean;", "}", "", "export const ENDPOINTS: readonly EndpointRow[] = ["]
for eid, method, path, op, bodyname, res, raw, hp in ENDPOINT_ROWS:
    ep.append(f'  {{ id: "{eid}", method: "{method}", path: {json.dumps(path)}, resource: "{res}", operation: "{op}", request: "{bodyname}Dto", rawBody: {str(raw).lower()}, noContent: {str(hp).lower()} }},')
ep.append("];")
(C / "endpoints.ts").write_text("\n".join(ep) + "\n")

print(f"models={len(MODELS)} enums={len(ENUMS)} relations={len(RELS)} endpoints={len(ENDPOINT_ROWS)} resources={len(RES)}")
