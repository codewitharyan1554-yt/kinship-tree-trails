import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Download, Pencil, Search, UserPlus, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { TreeCanvas } from "@/components/family/TreeCanvas";
import { PersonAvatar } from "@/components/family/PersonAvatar";
import { RelationshipList } from "@/components/family/RelationshipList";
import { AddRelativeDialog, EditPersonDialog, NewPersonDialog } from "@/components/family/PersonDialogs";
import { signedUrlsQuery, treeDataQuery, type Relation } from "@/lib/family-data";
import { buildIndex, fullName, lifeSpan } from "@/lib/relations";
import { downloadGedcom } from "@/lib/download";

export const Route = createFileRoute("/_authenticated/trees/$treeId")({
  validateSearch: (s: Record<string, unknown>): { focus?: string | undefined } => ({
    focus: typeof s["focus"] === "string" ? s["focus"] : undefined,
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(treeDataQuery(params.treeId)),
  head: () => ({
    meta: [
      { title: "Family tree — Vanshavali" },
      { name: "description", content: "Explore and edit your private family tree." },
      { property: "og:title", content: "Family tree — Vanshavali" },
      { property: "og:description", content: "Explore and edit your private family tree." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TreePage,
});

function TreePage() {
  const { treeId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data } = useSuspenseQuery(treeDataQuery(treeId));
  const idx = useMemo(() => buildIndex(data.people, data.families, data.links), [data]);

  const focusId =
    search.focus && idx.personById.has(search.focus) ? search.focus : (data.people[0]?.id ?? null);
  const focus = focusId ? idx.personById.get(focusId)! : null;

  const paths = useMemo(
    () => data.people.map((p) => p.photo_path).filter((p): p is string => !!p),
    [data.people],
  );
  const photoUrls = useQuery(signedUrlsQuery(paths)).data ?? {};

  const [findOpen, setFindOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [relation, setRelation] = useState<Relation | null>(null);

  const setFocus = (id: string) => navigate({ search: { focus: id }, replace: true });

  const sorted = useMemo(
    () => [...data.people].sort((a, b) => fullName(a).localeCompare(fullName(b))),
    [data.people],
  );

  return (
    <main className="flex flex-1 flex-col md:h-[calc(100dvh-3.5rem)] md:flex-row">
      <div className="relative h-[62dvh] flex-1 md:h-auto">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start justify-between gap-2 p-3">
          <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-border bg-card/95 px-2 py-1.5 shadow-card backdrop-blur">
            <Button asChild variant="ghost" size="icon" className="h-8 w-8" aria-label="Back to trees">
              <Link to="/trees"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <div className="pr-2">
              <h1 className="max-w-[40vw] truncate text-base font-semibold leading-tight">{data.tree.name}</h1>
              <p className="text-xs text-muted-foreground">
                {data.people.length} {data.people.length === 1 ? "person" : "people"}
              </p>
            </div>
          </div>
          <div className="pointer-events-auto flex gap-2">
            <Popover open={findOpen} onOpenChange={setFindOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="bg-card" disabled={data.people.length === 0}>
                  <Search className="mr-1.5 h-4 w-4" /> Find
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-0">
                <Command>
                  <CommandInput placeholder="Search people…" />
                  <CommandList className="max-h-72">
                    <CommandEmpty>No one found.</CommandEmpty>
                    {sorted.map((p) => (
                      <CommandItem
                        key={p.id}
                        value={`${fullName(p)} ${p.birth_place ?? ""} ${p.id}`}
                        onSelect={() => {
                          setFocus(p.id);
                          setFindOpen(false);
                        }}
                      >
                        <span className="flex-1 truncate">{fullName(p)}</span>
                        <span className="text-xs text-muted-foreground">{lifeSpan(p)}</span>
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="sm" className="bg-card" onClick={() => downloadGedcom(data)}>
              <Download className="mr-1.5 h-4 w-4" /> <span className="hidden sm:inline">Export </span>GEDCOM
            </Button>
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <UserPlus className="mr-1.5 h-4 w-4" /> <span className="hidden sm:inline">Add person</span>
            </Button>
          </div>
        </div>

        {focus ? (
          <TreeCanvas idx={idx} focusId={focus.id} onFocus={setFocus} photoUrls={photoUrls} />
        ) : (
          <div className="grid h-full place-items-center bg-dots px-6">
            <div className="max-w-sm text-center">
              <h2 className="text-2xl font-semibold">This tree is empty</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Add the first person — often yourself, or the elder you know the most about.
              </p>
              <Button className="mt-5" onClick={() => setNewOpen(true)}>
                <UserPlus className="mr-2 h-4 w-4" /> Add the first person
              </Button>
            </div>
          </div>
        )}
      </div>

      {focus && (
        <aside className="w-full shrink-0 overflow-y-auto border-t border-border bg-card md:w-80 md:border-l md:border-t-0">
          <div className="border-b border-border p-5">
            <div className="flex items-center gap-4">
              <PersonAvatar
                person={focus}
                url={focus.photo_path ? photoUrls[focus.photo_path] : null}
                className="h-16 w-16 text-lg"
              />
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold">{fullName(focus)}</h2>
                {lifeSpan(focus) && <p className="text-sm text-muted-foreground">{lifeSpan(focus)}</p>}
              </div>
            </div>
            <dl className="mt-4 space-y-1 text-sm">
              {(focus.birth_date || focus.birth_place) && (
                <div className="flex gap-2">
                  <dt className="w-12 shrink-0 text-muted-foreground">Born</dt>
                  <dd>{[focus.birth_date, focus.birth_place].filter(Boolean).join(", ")}</dd>
                </div>
              )}
              {(focus.death_date || focus.death_place) && (
                <div className="flex gap-2">
                  <dt className="w-12 shrink-0 text-muted-foreground">Died</dt>
                  <dd>{[focus.death_date, focus.death_place].filter(Boolean).join(", ")}</dd>
                </div>
              )}
            </dl>
            <div className="mt-4 flex gap-2">
              <Button asChild size="sm" className="flex-1">
                <Link to="/people/$personId" params={{ personId: focus.id }}>
                  <UserRound className="mr-1.5 h-4 w-4" /> Profile
                </Link>
              </Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditOpen(true)}>
                <Pencil className="mr-1.5 h-4 w-4" /> Edit
              </Button>
            </div>
          </div>
          <div className="p-5">
            <RelationshipList
              idx={idx}
              person={focus}
              photoUrls={photoUrls}
              onPick={setFocus}
              onAdd={setRelation}
            />
          </div>
          <EditPersonDialog open={editOpen} onOpenChange={setEditOpen} person={focus} />
          {relation && (
            <AddRelativeDialog
              open={!!relation}
              onOpenChange={(o) => !o && setRelation(null)}
              relation={relation}
              person={focus}
              idx={idx}
            />
          )}
        </aside>
      )}

      <NewPersonDialog open={newOpen} onOpenChange={setNewOpen} treeId={treeId} onCreated={(p) => setFocus(p.id)} />
    </main>
  );
}
