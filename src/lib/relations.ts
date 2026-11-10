// Pure helpers for reading relationships out of a family tree's rows.
// A "family" is a union (up to two partners) plus the children of that union.

export interface PersonLike {
  id: string;
  given_name: string;
  surname: string;
  sex: string;
  birth_date: string | null;
  death_date: string | null;
  photo_path?: string | null;
}

export interface FamilyLike {
  id: string;
  partner1_id: string | null;
  partner2_id: string | null;
}

export interface LinkLike {
  family_id: string;
  child_id: string;
}

export interface TreeIndex<P extends PersonLike = PersonLike, F extends FamilyLike = FamilyLike> {
  people: P[];
  personById: Map<string, P>;
  familyById: Map<string, F>;
  /** Families where the person is one of the partners */
  partnerFamilies: Map<string, F[]>;
  /** Families where the person is a child */
  parentFamilies: Map<string, F[]>;
  /** child ids for a family */
  childrenOfFamily: Map<string, string[]>;
}

export function buildIndex<P extends PersonLike, F extends FamilyLike>(
  people: P[],
  families: F[],
  links: LinkLike[],
): TreeIndex<P, F> {
  const personById = new Map(people.map((p) => [p.id, p]));
  const familyById = new Map(families.map((f) => [f.id, f]));
  const partnerFamilies = new Map<string, F[]>();
  const parentFamilies = new Map<string, F[]>();
  const childrenOfFamily = new Map<string, string[]>();

  for (const f of families) {
    for (const pid of [f.partner1_id, f.partner2_id]) {
      if (!pid) continue;
      const list = partnerFamilies.get(pid) ?? [];
      list.push(f);
      partnerFamilies.set(pid, list);
    }
  }
  for (const l of links) {
    const fam = familyById.get(l.family_id);
    if (!fam || !personById.has(l.child_id)) continue;
    const kids = childrenOfFamily.get(l.family_id) ?? [];
    kids.push(l.child_id);
    childrenOfFamily.set(l.family_id, kids);
    const pf = parentFamilies.get(l.child_id) ?? [];
    pf.push(fam);
    parentFamilies.set(l.child_id, pf);
  }
  // Oldest first, so the tree reads left-to-right by age
  for (const [fid, kids] of childrenOfFamily) {
    childrenOfFamily.set(
      fid,
      [...kids].sort((a, b) => compareByBirth(personById.get(a), personById.get(b))),
    );
  }
  return { people, personById, familyById, partnerFamilies, parentFamilies, childrenOfFamily };
}

function compareByBirth(a?: PersonLike, b?: PersonLike) {
  const ya = yearOf(a?.birth_date ?? null) ?? 99999;
  const yb = yearOf(b?.birth_date ?? null) ?? 99999;
  return ya - yb;
}

export function partnerIds(f: FamilyLike): string[] {
  return [f.partner1_id, f.partner2_id].filter((x): x is string => !!x);
}

export function otherPartner(f: FamilyLike, personId: string): string | null {
  if (f.partner1_id === personId) return f.partner2_id;
  if (f.partner2_id === personId) return f.partner1_id;
  return null;
}

export function parentsOf(idx: TreeIndex, personId: string): string[] {
  const out: string[] = [];
  for (const f of idx.parentFamilies.get(personId) ?? []) {
    for (const p of partnerIds(f)) if (!out.includes(p)) out.push(p);
  }
  return out;
}

export function partnersOf(idx: TreeIndex, personId: string): string[] {
  const out: string[] = [];
  for (const f of idx.partnerFamilies.get(personId) ?? []) {
    const o = otherPartner(f, personId);
    if (o && !out.includes(o)) out.push(o);
  }
  return out;
}

export function childrenOf(idx: TreeIndex, personId: string): string[] {
  const out: string[] = [];
  for (const f of idx.partnerFamilies.get(personId) ?? []) {
    for (const c of idx.childrenOfFamily.get(f.id) ?? []) if (!out.includes(c)) out.push(c);
  }
  return out;
}

export function siblingsOf(idx: TreeIndex, personId: string): string[] {
  const out: string[] = [];
  for (const f of idx.parentFamilies.get(personId) ?? []) {
    for (const c of idx.childrenOfFamily.get(f.id) ?? []) {
      if (c !== personId && !out.includes(c)) out.push(c);
    }
  }
  return out;
}

export function yearOf(date: string | null): number | null {
  if (!date) return null;
  const m = date.match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

export function fullName(p: Pick<PersonLike, "given_name" | "surname"> | undefined): string {
  if (!p) return "Unknown";
  const n = `${p.given_name} ${p.surname}`.trim();
  return n || "Unnamed";
}

export function lifeSpan(p: Pick<PersonLike, "birth_date" | "death_date">): string {
  const b = yearOf(p.birth_date);
  const d = yearOf(p.death_date);
  if (!b && !d) return "";
  return `${b ?? "?"} – ${d ?? (p.death_date ? "?" : "")}`.trim();
}

export function initials(p: Pick<PersonLike, "given_name" | "surname">): string {
  const a = p.given_name.trim()[0] ?? "";
  const b = p.surname.trim()[0] ?? "";
  return (a + b).toUpperCase() || "?";
}
