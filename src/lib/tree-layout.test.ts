import { describe, expect, it } from "vitest";

import { buildIndex } from "./relations";
import { CARD_H, CARD_W, computeLayout } from "./tree-layout";

const person = (id: string) => ({ id, given_name: id, surname: "", sex: "U", birth_date: null, death_date: null });

// grandpa+grandma -> dad (+mum) -> me (+wife) -> kid1, kid2 ; me has a sister
const people = ["gpa", "gma", "dad", "mum", "me", "sis", "wife", "kid1", "kid2"].map(person);
const families = [
  { id: "f0", partner1_id: "gpa", partner2_id: "gma" },
  { id: "f1", partner1_id: "dad", partner2_id: "mum" },
  { id: "f2", partner1_id: "me", partner2_id: "wife" },
];
const links = [
  { family_id: "f0", child_id: "dad" },
  { family_id: "f1", child_id: "me" },
  { family_id: "f1", child_id: "sis" },
  { family_id: "f2", child_id: "kid1" },
  { family_id: "f2", child_id: "kid2" },
];

describe("tree layout", () => {
  const idx = buildIndex(people, families, links);
  const layout = computeLayout(idx, "me");
  const at = (id: string) => layout.nodes.find((n) => n.personId === id)!;

  it("puts the chosen person at the centre", () => {
    expect(at("me")).toMatchObject({ x: 0, y: 0, role: "focus" });
  });

  it("puts parents above, partner and siblings on the same row, children below", () => {
    expect(at("dad").y).toBeLessThan(0);
    expect(at("gpa").y).toBeLessThan(at("dad").y);
    expect(at("wife").y).toBe(0);
    expect(at("wife").x).toBeGreaterThan(0);
    expect(at("sis").y).toBe(0);
    expect(at("sis").x).toBeLessThan(0);
    expect(at("kid1").y).toBeGreaterThan(0);
  });

  it("never overlaps two cards", () => {
    const n = layout.nodes;
    for (let i = 0; i < n.length; i++) {
      for (let j = i + 1; j < n.length; j++) {
        const a = n[i]!;
        const b = n[j]!;
        const overlapX = Math.abs(a.x - b.x) < CARD_W;
        const overlapY = Math.abs(a.y - b.y) < CARD_H;
        expect(overlapX && overlapY, `${a.personId} overlaps ${b.personId}`).toBe(false);
      }
    }
  });

  it("does not loop forever on bad data where someone is their own ancestor", () => {
    const loopIdx = buildIndex(
      [person("a"), person("b")],
      [{ id: "x", partner1_id: "a", partner2_id: null }, { id: "y", partner1_id: "b", partner2_id: null }],
      [{ family_id: "x", child_id: "b" }, { family_id: "y", child_id: "a" }],
    );
    expect(() => computeLayout(loopIdx, "a")).not.toThrow();
  });
});
