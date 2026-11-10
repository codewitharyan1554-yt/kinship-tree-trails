import { describe, expect, it } from "vitest";

import { buildGedcom, parseGedcom } from "./gedcom";

const sample = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Ram /Sharma/
1 SEX M
1 BIRT
2 DATE ABT 1932
2 PLAC Lahore, Punjab
1 NOTE Ran a cloth shop
2 CONT in Amritsar.
1 FAMS @F1@
0 @I2@ INDI
1 NAME Sita /Sharma/
1 SEX F
1 FAMS @F1@
0 @I3@ INDI
1 NAME Mohan /Sharma/
1 SEX M
1 DEAT
2 DATE 2001
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 MARR
2 DATE 1955
0 TRLR
`;

describe("GEDCOM import", () => {
  it("reads people, names, dates, places and multi-line notes", () => {
    const g = parseGedcom(sample);
    expect(g.people).toHaveLength(3);
    const ram = g.people[0]!;
    expect(ram.given_name).toBe("Ram");
    expect(ram.surname).toBe("Sharma");
    expect(ram.sex).toBe("M");
    expect(ram.birth_date).toBe("ABT 1932");
    expect(ram.birth_place).toBe("Lahore, Punjab");
    expect(ram.notes).toBe("Ran a cloth shop\nin Amritsar.");
    expect(g.people[2]!.death_date).toBe("2001");
  });

  it("reads couples and their children", () => {
    const g = parseGedcom(sample);
    expect(g.families).toEqual([
      { xref: "@F1@", partner1: "@I1@", partner2: "@I2@", children: ["@I3@"], marriage_date: "1955", marriage_place: null },
    ]);
  });

  it("ignores links to people that are not in the file", () => {
    const g = parseGedcom("0 @F1@ FAM\n1 HUSB @I9@\n1 CHIL @I8@\n0 TRLR");
    expect(g.families[0]!.partner1).toBeNull();
    expect(g.families[0]!.children).toEqual([]);
  });
});

describe("GEDCOM export", () => {
  it("round-trips people and relationships", () => {
    const people = [
      { id: "a", given_name: "Ram", surname: "Sharma", sex: "M", birth_date: "1932", birth_place: "Lahore", death_date: null, death_place: null, notes: "Line one\nLine two" },
      { id: "b", given_name: "Sita", surname: "Sharma", sex: "F", birth_date: null, birth_place: null, death_date: null, death_place: null, notes: null },
      { id: "c", given_name: "Mohan", surname: "Sharma", sex: "M", birth_date: null, birth_place: null, death_date: "2001", death_place: null, notes: null },
    ];
    // partner order deliberately reversed: export puts the man in HUSB
    const families = [{ id: "f", partner1_id: "b", partner2_id: "a", marriage_date: "1955", marriage_place: "Delhi" }];
    const links = [{ family_id: "f", child_id: "c" }];

    const text = buildGedcom("Sharma family", people, families, links);
    expect(text).toContain("1 HUSB @I1@");
    expect(text).toContain("1 WIFE @I2@");

    const back = parseGedcom(text);
    expect(back.people.map((p) => `${p.given_name} ${p.surname}`)).toEqual(["Ram Sharma", "Sita Sharma", "Mohan Sharma"]);
    expect(back.people[0]!.notes).toBe("Line one\nLine two");
    expect(back.people[0]!.birth_place).toBe("Lahore");
    expect(back.families[0]!.children).toEqual(["@I3@"]);
    expect(back.families[0]!.marriage_place).toBe("Delhi");
  });
});
