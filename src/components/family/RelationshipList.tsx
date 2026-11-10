import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Person, Relation } from "@/lib/family-data";
import { childrenOf, fullName, lifeSpan, parentsOf, partnersOf, siblingsOf, type TreeIndex } from "@/lib/relations";
import { PersonAvatar } from "./PersonAvatar";

const groups: { key: Relation; title: string; get: (idx: TreeIndex, id: string) => string[] }[] = [
  { key: "parent", title: "Parents", get: parentsOf },
  { key: "partner", title: "Partners", get: partnersOf },
  { key: "child", title: "Children", get: childrenOf },
  { key: "sibling", title: "Brothers & sisters", get: siblingsOf },
];

export function RelationshipList({
  idx,
  person,
  photoUrls,
  onPick,
  onAdd,
  onRemove,
}: {
  idx: TreeIndex<Person>;
  person: Person;
  photoUrls: Record<string, string>;
  onPick: (id: string) => void;
  onAdd: (relation: Relation) => void;
  onRemove?: (relation: Relation, relativeId: string) => void;
}) {
  return (
    <div className="space-y-5">
      {groups.map((g) => {
        const ids = g.get(idx, person.id);
        const canAdd = !(g.key === "parent" && ids.length >= 2);
        return (
          <section key={g.key}>
            <div className="mb-1.5 flex items-center justify-between">
              <h3 className="font-sans text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {g.title}
              </h3>
              {canAdd && (
                <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => onAdd(g.key)}>
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              )}
            </div>
            {ids.length === 0 ? (
              <p className="text-sm text-muted-foreground/80">None added yet</p>
            ) : (
              <ul className="space-y-1">
                {ids.map((id) => {
                  const p = idx.personById.get(id);
                  if (!p) return null;
                  return (
                    <li key={id} className="group flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onPick(id)}
                        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left hover:bg-secondary"
                      >
                        <PersonAvatar person={p} url={p.photo_path ? photoUrls[p.photo_path] : null} className="h-8 w-8 text-xs" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{fullName(p)}</span>
                          {lifeSpan(p) && <span className="block text-xs text-muted-foreground">{lifeSpan(p)}</span>}
                        </span>
                      </button>
                      {onRemove && g.key !== "sibling" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-60 hover:opacity-100"
                          aria-label={`Remove link to ${fullName(p)}`}
                          onClick={() => onRemove(g.key, id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
