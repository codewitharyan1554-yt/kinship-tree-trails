// Hourglass layout centred on one "focus" person:
// ancestors above, siblings to the left, partners to the right, descendants below.
import { otherPartner, partnerIds, type TreeIndex } from "./relations";

export const CARD_W = 184;
export const CARD_H = 76;
const H_GAP = 28;
const V_GAP = 64;
const UNIT = CARD_W + H_GAP;
const ROW = CARD_H + V_GAP;

export const MAX_ANCESTOR_DEPTH = 3;
export const MAX_DESCENDANT_DEPTH = 2;

export type NodeRole = "focus" | "ancestor" | "partner" | "sibling" | "descendant";

export interface LayoutNode {
  key: string;
  personId: string;
  /** centre x */
  x: number;
  /** top y */
  y: number;
  role: NodeRole;
}

export interface Layout {
  nodes: LayoutNode[];
  edges: string[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

export function computeLayout(idx: TreeIndex, focusId: string): Layout {
  const nodes: LayoutNode[] = [];
  const edges: string[] = [];
  const used = new Map<string, number>();

  const add = (personId: string, x: number, y: number, role: NodeRole) => {
    const n = used.get(personId) ?? 0;
    used.set(personId, n + 1);
    nodes.push({ key: n === 0 ? personId : `${personId}#${n}`, personId, x, y, role });
  };

  if (!idx.personById.has(focusId)) {
    return { nodes, edges, bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 } };
  }

  add(focusId, 0, 0, "focus");

  // ---------- Ancestors ----------
  const firstParentFamily = (pid: string) => idx.parentFamilies.get(pid)?.[0];

  const ancestorDepth = (pid: string, g: number, seen: Set<string>): number => {
    if (g >= MAX_ANCESTOR_DEPTH) return g;
    const fam = firstParentFamily(pid);
    const parents = fam ? partnerIds(fam) : [];
    let best = g;
    for (const p of parents) {
      if (seen.has(p)) continue;
      best = Math.max(best, ancestorDepth(p, g + 1, new Set([...seen, p])));
    }
    return best;
  };
  const D = ancestorDepth(focusId, 0, new Set([focusId]));

  const placeAncestors = (pid: string, childX: number, g: number, seen: Set<string>) => {
    if (g > D) return;
    const fam = firstParentFamily(pid);
    if (!fam) return;
    const parents = partnerIds(fam).filter((p) => !seen.has(p));
    if (parents.length === 0) return;
    const y = -g * ROW;
    const childTop = y + ROW; // top of child row
    const offset = (UNIT * 2 ** (D - g)) / 2;

    if (parents.length === 2) {
      const [a, b] = parents as [string, string];
      const xa = childX - offset;
      const xb = childX + offset;
      add(a, xa, y, "ancestor");
      add(b, xb, y, "ancestor");
      edges.push(`M ${xa + CARD_W / 2} ${y + CARD_H / 2} H ${xb - CARD_W / 2}`);
      if (g > 1) edges.push(`M ${childX} ${y + CARD_H / 2} V ${childTop}`);
      placeAncestors(a, xa, g + 1, new Set([...seen, a]));
      placeAncestors(b, xb, g + 1, new Set([...seen, b]));
    } else {
      const [a] = parents as [string];
      add(a, childX, y, "ancestor");
      if (g > 1) edges.push(`M ${childX} ${y + CARD_H} V ${childTop}`);
      placeAncestors(a, childX, g + 1, new Set([...seen, a]));
    }
  };
  placeAncestors(focusId, 0, 1, new Set([focusId]));

  // ---------- Siblings (left of focus) + bus from parents ----------
  const pFam = firstParentFamily(focusId);
  if (pFam) {
    const sibs = (idx.childrenOfFamily.get(pFam.id) ?? []).filter((c) => c !== focusId);
    const childXs = [0];
    sibs.forEach((s, i) => {
      const x = -(i + 1) * UNIT;
      add(s, x, 0, "sibling");
      childXs.push(x);
    });
    const parents = partnerIds(pFam);
    if (parents.length > 0) {
      const startY = parents.length === 2 ? -ROW + CARD_H / 2 : -ROW + CARD_H;
      const busY = -V_GAP / 2;
      edges.push(`M 0 ${startY} V ${busY}`);
    }
    if (parents.length > 0 || sibs.length > 0) {
      const busY = -V_GAP / 2;
      const minX = Math.min(...childXs);
      if (minX < 0) edges.push(`M ${minX} ${busY} H 0`);
      for (const x of childXs) edges.push(`M ${x} ${busY} V 0`);
    }
  }

  // ---------- Partners (right of focus) ----------
  const famAnchors: { famId: string; anchorX: number; startY: number }[] = [];
  let partnerSlot = 0;
  for (const f of idx.partnerFamilies.get(focusId) ?? []) {
    const other = otherPartner(f, focusId);
    if (other && idx.personById.has(other)) {
      partnerSlot += 1;
      const x = partnerSlot * UNIT;
      add(other, x, 0, "partner");
      const lineY = CARD_H / 2 + (partnerSlot - 1) * 8;
      edges.push(`M ${CARD_W / 2} ${lineY} H ${x - CARD_W / 2}`);
      famAnchors.push({ famId: f.id, anchorX: x - UNIT / 2, startY: lineY });
    } else {
      famAnchors.push({ famId: f.id, anchorX: 0, startY: CARD_H });
    }
  }

  // ---------- Descendants ----------
  const kidsOf = (pid: string): string[] => {
    const out: string[] = [];
    for (const f of idx.partnerFamilies.get(pid) ?? []) {
      for (const c of idx.childrenOfFamily.get(f.id) ?? []) if (!out.includes(c)) out.push(c);
    }
    return out;
  };

  const subtreeWidth = (pid: string, gen: number, seen: Set<string>): number => {
    if (gen >= MAX_DESCENDANT_DEPTH) return UNIT;
    const kids = kidsOf(pid).filter((k) => !seen.has(k));
    if (kids.length === 0) return UNIT;
    const sum = kids.reduce((s, k) => s + subtreeWidth(k, gen + 1, new Set([...seen, k])), 0);
    return Math.max(UNIT, sum);
  };

  const placeDescendant = (pid: string, left: number, width: number, gen: number, seen: Set<string>) => {
    const x = left + width / 2;
    const y = gen * ROW;
    add(pid, x, y, "descendant");
    if (gen >= MAX_DESCENDANT_DEPTH) return;
    const kids = kidsOf(pid).filter((k) => !seen.has(k));
    if (kids.length === 0) return;
    const widths = kids.map((k) => subtreeWidth(k, gen + 1, new Set([...seen, k])));
    const total = widths.reduce((a, b) => a + b, 0);
    let cursor = x - total / 2;
    const busY = y + CARD_H + V_GAP / 2;
    const xs: number[] = [];
    kids.forEach((k, i) => {
      const w = widths[i]!;
      xs.push(cursor + w / 2);
      placeDescendant(k, cursor, w, gen + 1, new Set([...seen, k]));
      cursor += w;
    });
    edges.push(`M ${x} ${y + CARD_H} V ${busY}`);
    edges.push(`M ${Math.min(x, ...xs)} ${busY} H ${Math.max(x, ...xs)}`);
    for (const cx of xs) edges.push(`M ${cx} ${busY} V ${busY + V_GAP / 2}`);
  };

  const blocks = famAnchors
    .map((a) => {
      const kids = idx.childrenOfFamily.get(a.famId) ?? [];
      const widths = kids.map((k) => subtreeWidth(k, 1, new Set([focusId, k])));
      return { ...a, kids, widths, total: widths.reduce((s, w) => s + w, 0) };
    })
    .filter((b) => b.kids.length > 0);

  if (blocks.length > 0) {
    const grand = blocks.reduce((s, b) => s + b.total, 0);
    const centre = blocks.reduce((s, b) => s + b.anchorX, 0) / blocks.length;
    let cursor = centre - grand / 2;
    const busY = CARD_H + V_GAP / 2;
    const placedKids = new Set<string>();
    for (const b of blocks) {
      const xs: number[] = [];
      b.kids.forEach((k, i) => {
        const w = b.widths[i]!;
        if (!placedKids.has(k)) {
          placedKids.add(k);
          xs.push(cursor + w / 2);
          placeDescendant(k, cursor, w, 1, new Set([focusId, k]));
        }
        cursor += w;
      });
      if (xs.length === 0) continue;
      edges.push(`M ${b.anchorX} ${b.startY} V ${busY}`);
      edges.push(`M ${Math.min(b.anchorX, ...xs)} ${busY} H ${Math.max(b.anchorX, ...xs)}`);
      for (const cx of xs) edges.push(`M ${cx} ${busY} V ${ROW}`);
    }
  }

  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  return {
    nodes,
    edges,
    bounds: {
      minX: Math.min(...xs) - CARD_W / 2,
      maxX: Math.max(...xs) + CARD_W / 2,
      minY: Math.min(...ys),
      maxY: Math.max(...ys) + CARD_H,
    },
  };
}
