import { buildGedcom } from "./gedcom";
import type { TreeData } from "./family-data";

export function downloadGedcom(data: TreeData) {
  const text = buildGedcom(data.tree.name, data.people, data.families, data.links);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${data.tree.name.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "family-tree"}.ged`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
