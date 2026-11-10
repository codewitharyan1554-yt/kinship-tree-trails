// Minimal GEDCOM 5.5.1 reader/writer covering people, couples, children,
// names, sex, birth, death, marriage and notes.

export interface GedPerson {
  xref: string;
  given_name: string;
  surname: string;
  sex: "M" | "F" | "U";
  birth_date: string | null;
  birth_place: string | null;
  death_date: string | null;
  death_place: string | null;
  notes: string | null;
}

export interface GedFamily {
  xref: string;
  partner1: string | null;
  partner2: string | null;
  children: string[];
  marriage_date: string | null;
  marriage_place: string | null;
}

export interface ParsedGedcom {
  people: GedPerson[];
  families: GedFamily[];
}

interface Line {
  level: number;
  xref: string | null;
  tag: string;
  value: string;
  children: Line[];
}

function parseLines(text: string): Line[] {
  const roots: Line[] = [];
  const stack: Line[] = [];
  const raw = text.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/);
  for (const r of raw) {
    const line = r.trim();
    if (!line) continue;
    const m = line.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s(.*))?$/);
    if (!m) continue;
    const node: Line = {
      level: Number(m[1]),
      xref: m[2] ?? null,
      tag: m[3]!.toUpperCase(),
      value: m[4] ?? "",
      children: [],
    };
    while (stack.length && stack[stack.length - 1]!.level >= node.level) stack.pop();
    if (stack.length === 0) roots.push(node);
    else stack[stack.length - 1]!.children.push(node);
    stack.push(node);
  }
  return roots;
}

function textWithContinuations(line: Line): string {
  let out = line.value;
  for (const c of line.children) {
    if (c.tag === "CONT") out += "\n" + c.value;
    else if (c.tag === "CONC") out += c.value;
  }
  return out;
}

const child = (l: Line, tag: string) => l.children.find((c) => c.tag === tag);
const childValue = (l: Line | undefined, tag: string) => {
  if (!l) return null;
  const c = child(l, tag);
  const v = c ? textWithContinuations(c).trim() : "";
  return v || null;
};

export function parseGedcom(text: string): ParsedGedcom {
  const roots = parseLines(text);
  const noteRecords = new Map<string, string>();
  for (const r of roots) {
    if (r.tag === "NOTE" && r.xref) noteRecords.set(r.xref, textWithContinuations(r));
  }

  const people: GedPerson[] = [];
  const families: GedFamily[] = [];

  for (const r of roots) {
    if (r.tag === "INDI" && r.xref) {
      const nameLine = child(r, "NAME");
      let given = "";
      let surname = "";
      if (nameLine) {
        const m = nameLine.value.match(/^([^/]*)(?:\/([^/]*)\/?)?(.*)$/);
        given = (m?.[1] ?? "").trim();
        surname = (m?.[2] ?? "").trim();
        const suffix = (m?.[3] ?? "").trim();
        if (suffix) given = `${given} ${suffix}`.trim();
        given = childValue(nameLine, "GIVN") ?? given;
        surname = childValue(nameLine, "SURN") ?? surname;
      }
      const sexRaw = (child(r, "SEX")?.value ?? "").trim().toUpperCase();
      const sex = sexRaw === "M" || sexRaw === "F" ? sexRaw : "U";
      const birt = child(r, "BIRT");
      const deat = child(r, "DEAT");
      const notes = r.children
        .filter((c) => c.tag === "NOTE")
        .map((c) => {
          const v = c.value.trim();
          if (/^@[^@]+@$/.test(v)) return noteRecords.get(v) ?? "";
          return textWithContinuations(c);
        })
        .filter((n) => n.trim())
        .join("\n\n");
      people.push({
        xref: r.xref,
        given_name: given,
        surname,
        sex,
        birth_date: childValue(birt, "DATE"),
        birth_place: childValue(birt, "PLAC"),
        death_date: childValue(deat, "DATE"),
        death_place: childValue(deat, "PLAC"),
        notes: notes || null,
      });
    }
  }

  const ids = new Set(people.map((p) => p.xref));
  for (const r of roots) {
    if (r.tag === "FAM" && r.xref) {
      const ref = (tag: string) => {
        const v = child(r, tag)?.value.trim() ?? "";
        return ids.has(v) ? v : null;
      };
      const marr = child(r, "MARR");
      families.push({
        xref: r.xref,
        partner1: ref("HUSB"),
        partner2: ref("WIFE"),
        children: r.children
          .filter((c) => c.tag === "CHIL")
          .map((c) => c.value.trim())
          .filter((v) => ids.has(v)),
        marriage_date: childValue(marr, "DATE"),
        marriage_place: childValue(marr, "PLAC"),
      });
    }
  }

  return { people, families };
}

// ---------------- Writer ----------------

export interface ExportPerson {
  id: string;
  given_name: string;
  surname: string;
  sex: string;
  birth_date: string | null;
  birth_place: string | null;
  death_date: string | null;
  death_place: string | null;
  notes: string | null;
}

export interface ExportFamily {
  id: string;
  partner1_id: string | null;
  partner2_id: string | null;
  marriage_date: string | null;
  marriage_place: string | null;
}

export interface ExportLink {
  family_id: string;
  child_id: string;
}

function clean(v: string) {
  return v.replace(/[\r\n]+/g, " ").trim();
}

function pushText(out: string[], level: number, tag: string, text: string) {
  const lines = text.split(/\r\n|\r|\n/);
  lines.forEach((l, i) => {
    const chunks = l.match(/.{1,200}/g) ?? [""];
    chunks.forEach((chunk, j) => {
      if (i === 0 && j === 0) out.push(`${level} ${tag}${chunk ? " " + chunk : ""}`);
      else if (j === 0) out.push(`${level + 1} CONT${chunk ? " " + chunk : ""}`);
      else out.push(`${level + 1} CONC ${chunk}`);
    });
  });
}

export function buildGedcom(
  treeName: string,
  people: ExportPerson[],
  families: ExportFamily[],
  links: ExportLink[],
): string {
  const pRef = new Map(people.map((p, i) => [p.id, `@I${i + 1}@`]));
  const fRef = new Map(families.map((f, i) => [f.id, `@F${i + 1}@`]));
  const out: string[] = [
    "0 HEAD",
    "1 SOUR VANSHAVALI",
    "2 NAME Vanshavali",
    "1 GEDC",
    "2 VERS 5.5.1",
    "2 FORM LINEAGE-LINKED",
    "1 CHAR UTF-8",
  ];
  if (treeName) out.push(`1 NOTE ${clean(treeName)}`);

  const famsOf = new Map<string, string[]>();
  const famcOf = new Map<string, string[]>();
  for (const f of families) {
    for (const p of [f.partner1_id, f.partner2_id]) {
      if (p && pRef.has(p)) famsOf.set(p, [...(famsOf.get(p) ?? []), f.id]);
    }
  }
  for (const l of links) {
    if (pRef.has(l.child_id) && fRef.has(l.family_id))
      famcOf.set(l.child_id, [...(famcOf.get(l.child_id) ?? []), l.family_id]);
  }

  for (const p of people) {
    out.push(`0 ${pRef.get(p.id)} INDI`);
    out.push(`1 NAME ${clean(p.given_name)} /${clean(p.surname)}/`.replace("  ", " "));
    if (p.given_name.trim()) out.push(`2 GIVN ${clean(p.given_name)}`);
    if (p.surname.trim()) out.push(`2 SURN ${clean(p.surname)}`);
    out.push(`1 SEX ${p.sex === "M" || p.sex === "F" ? p.sex : "U"}`);
    if (p.birth_date || p.birth_place) {
      out.push("1 BIRT");
      if (p.birth_date) out.push(`2 DATE ${clean(p.birth_date)}`);
      if (p.birth_place) out.push(`2 PLAC ${clean(p.birth_place)}`);
    }
    if (p.death_date || p.death_place) {
      out.push("1 DEAT");
      if (p.death_date) out.push(`2 DATE ${clean(p.death_date)}`);
      if (p.death_place) out.push(`2 PLAC ${clean(p.death_place)}`);
    }
    if (p.notes?.trim()) pushText(out, 1, "NOTE", p.notes.trim());
    for (const f of famcOf.get(p.id) ?? []) out.push(`1 FAMC ${fRef.get(f)}`);
    for (const f of famsOf.get(p.id) ?? []) out.push(`1 FAMS ${fRef.get(f)}`);
  }

  const personById = new Map(people.map((p) => [p.id, p]));
  for (const f of families) {
    out.push(`0 ${fRef.get(f.id)} FAM`);
    let husb = f.partner1_id && pRef.has(f.partner1_id) ? f.partner1_id : null;
    let wife = f.partner2_id && pRef.has(f.partner2_id) ? f.partner2_id : null;
    // Put the man in HUSB and the woman in WIFE when we know their sex
    const hs = husb ? personById.get(husb)?.sex : null;
    const ws = wife ? personById.get(wife)?.sex : null;
    if (hs === "F" || ws === "M") [husb, wife] = [wife, husb];
    if (husb) out.push(`1 HUSB ${pRef.get(husb)}`);
    if (wife) out.push(`1 WIFE ${pRef.get(wife)}`);
    for (const l of links) {
      if (l.family_id === f.id && pRef.has(l.child_id)) out.push(`1 CHIL ${pRef.get(l.child_id)}`);
    }
    if (f.marriage_date || f.marriage_place) {
      out.push("1 MARR");
      if (f.marriage_date) out.push(`2 DATE ${clean(f.marriage_date)}`);
      if (f.marriage_place) out.push(`2 PLAC ${clean(f.marriage_place)}`);
    }
  }
  out.push("0 TRLR");
  return out.join("\n") + "\n";
}
