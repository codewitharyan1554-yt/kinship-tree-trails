import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ImagePlus, Network, Pencil, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PersonAvatar } from "@/components/family/PersonAvatar";
import { RelationshipList } from "@/components/family/RelationshipList";
import { FriendsSection } from "@/components/family/FriendsSection";
import { AddRelativeDialog, EditPersonDialog } from "@/components/family/PersonDialogs";
import {
  deletePerson,
  deletePhoto,
  personPhotosQuery,
  personQuery,
  refreshTree,
  removeParentFromFamily,
  removeParentLink,
  removePartnerLink,
  signedUrlsQuery,
  treeDataQuery,
  updatePerson,
  uploadPhoto,
  type Relation,
} from "@/lib/family-data";
import { buildIndex, fullName, lifeSpan, otherPartner, partnerIds } from "@/lib/relations";

export const Route = createFileRoute("/_authenticated/people/$personId")({
  loader: async ({ context, params }) => {
    const p = await context.queryClient.ensureQueryData(personQuery(params.personId));
    await context.queryClient.ensureQueryData(treeDataQuery(p.tree_id));
    return { treeId: p.tree_id };
  },
  head: () => ({
    meta: [
      { title: "Person profile — Vanshavali" },
      { name: "description", content: "Life details, relatives and photos for one person in your family tree." },
      { property: "og:title", content: "Person profile — Vanshavali" },
      { property: "og:description", content: "Life details, relatives and photos for one person in your family tree." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PersonPage,
});

const sexLabel: Record<string, string> = { M: "Male", F: "Female", U: "Unknown" };

function PersonPage() {
  const { personId } = Route.useParams();
  const { treeId } = Route.useLoaderData();
  const { user } = useRouteContext({ from: "/_authenticated" });
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(treeDataQuery(treeId));
  const idx = useMemo(() => buildIndex(data.people, data.families, data.links), [data]);
  const person = idx.personById.get(personId);

  const allPaths = useMemo(
    () => data.people.map((p) => p.photo_path).filter((p): p is string => !!p),
    [data.people],
  );
  const photosQ = useQuery({
    ...personPhotosQuery(user.id, { id: personId, tree_id: treeId }),
  });
  const gallery = photosQ.data ?? [];
  const urlsQ = useQuery(signedUrlsQuery([...new Set([...allPaths, ...gallery])]));
  const urls = urlsQ.data ?? {};

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [relation, setRelation] = useState<Relation | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!person) {
    return (
      <main className="mx-auto max-w-xl flex-1 px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">This person was removed</h1>
        <Button asChild className="mt-6">
          <Link to="/trees/$treeId" params={{ treeId }} search={{ focus: undefined }}>Back to the tree</Link>
        </Button>
      </main>
    );
  }

  async function onUpload(files: FileList) {
    if (!person) return;
    setUploading(true);
    try {
      let current = person;
      for (const f of Array.from(files)) {
        if (!f.type.startsWith("image/")) continue;
        if (f.size > 10 * 1024 * 1024) {
          toast.error(`${f.name} is larger than 10 MB`);
          continue;
        }
        const path = await uploadPhoto(user.id, current, f);
        if (!current.photo_path) current = { ...current, photo_path: path };
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["photos", person.id] }),
        refreshTree(qc, treeId),
      ]);
      toast.success("Photos added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onRemovePhoto(path: string) {
    if (!person) return;
    try {
      await deletePhoto(person, path, gallery);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["photos", person.id] }),
        refreshTree(qc, treeId),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete photo");
    }
  }

  async function onMakeProfile(path: string) {
    if (!person) return;
    await updatePerson(person.id, { photo_path: path });
    await refreshTree(qc, treeId);
    toast.success("Profile photo updated");
  }

  async function onRemoveLink(rel: Relation, relativeId: string) {
    if (!person) return;
    try {
      if (rel === "parent") {
        const fam = (idx.parentFamilies.get(person.id) ?? []).find((f) => partnerIds(f).includes(relativeId));
        if (fam) {
          // If they're the only parent, unlink the child; otherwise drop just that parent
          if (partnerIds(fam).length === 1) await removeParentLink(fam.id, person.id);
          else await removeParentFromFamily(fam, relativeId);
        }
      } else if (rel === "partner") {
        const fam = (idx.partnerFamilies.get(person.id) ?? []).find((f) => otherPartner(f, person.id) === relativeId);
        if (fam) await removePartnerLink(idx, fam, person.id);
      } else if (rel === "child") {
        const fam = (idx.partnerFamilies.get(person.id) ?? []).find((f) =>
          (idx.childrenOfFamily.get(f.id) ?? []).includes(relativeId),
        );
        if (fam) await removeParentLink(fam.id, relativeId);
      }
      await refreshTree(qc, treeId);
      toast.success("Link removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove link");
    }
  }

  async function onDelete() {
    if (!person) return;
    try {
      await deletePerson(user.id, person, idx);
      await refreshTree(qc, treeId);
      toast.success(`${fullName(person)} deleted`);
      navigate({ to: "/trees/$treeId", params: { treeId }, search: { focus: undefined } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete");
    }
  }

  const profileUrl = person.photo_path ? urls[person.photo_path] : null;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <Link
        to="/trees/$treeId"
        params={{ treeId }}
        search={{ focus: person.id }}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {data.tree.name}
      </Link>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          <section className="flex flex-col gap-6 rounded-xl border border-border bg-card p-6 shadow-card sm:flex-row sm:items-center">
            <PersonAvatar person={person} url={profileUrl} className="h-28 w-28 text-3xl" />
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-semibold">{fullName(person)}</h1>
              {lifeSpan(person) && <p className="mt-1 text-lg text-muted-foreground">{lifeSpan(person)}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="mr-1.5 h-4 w-4" /> Edit details
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/trees/$treeId" params={{ treeId }} search={{ focus: person.id }}>
                    <Network className="mr-1.5 h-4 w-4" /> Show in tree
                  </Link>
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="mr-1.5 h-4 w-4" /> Delete
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-6 shadow-card">
            <h2 className="mb-4 text-xl font-semibold">Life</h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Fact label="Born" value={person.birth_date} sub={person.birth_place} />
              <Fact label="Died" value={person.death_date} sub={person.death_place} empty="Living, or not recorded" />
              <Fact label="Sex" value={sexLabel[person.sex] ?? "Unknown"} />
            </dl>
            {person.notes && (
              <div className="mt-6 border-t border-border pt-5">
                <h3 className="mb-2 font-sans text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{person.notes}</p>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-6 shadow-card">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Photos</h2>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) onUpload(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
                <ImagePlus className="mr-1.5 h-4 w-4" /> {uploading ? "Uploading…" : "Add photos"}
              </Button>
            </div>
            {gallery.length === 0 ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full rounded-lg border border-dashed border-border px-4 py-10 text-sm text-muted-foreground hover:bg-secondary/50"
              >
                No photos yet. Add portraits, old family photos or documents.
              </button>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {gallery.map((path) => (
                  <li key={path} className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
                    {urls[path] && <img src={urls[path]} alt="" className="h-full w-full object-cover" loading="lazy" />}
                    {person.photo_path === path && (
                      <span className="absolute left-2 top-2 rounded bg-primary px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground">
                        Profile
                      </span>
                    )}
                    <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-foreground/60 to-transparent p-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                      {person.photo_path !== path && (
                        <Button size="icon" variant="secondary" className="h-7 w-7" aria-label="Use as profile photo" onClick={() => onMakeProfile(path)}>
                          <Star className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button size="icon" variant="secondary" className="h-7 w-7" aria-label="Delete photo" onClick={() => onRemovePhoto(path)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="h-fit space-y-8">
          <section className="rounded-xl border border-border bg-card p-6 shadow-card">
            <h2 className="mb-4 text-xl font-semibold">Family</h2>
            <RelationshipList
              idx={idx}
              person={person}
              photoUrls={urls}
              onPick={(id) => navigate({ to: "/people/$personId", params: { personId: id } })}
              onAdd={setRelation}
              onRemove={onRemoveLink}
            />
          </section>
          <FriendsSection
            idx={idx}
            person={person}
            photoUrls={urls}
            onPick={(id) => navigate({ to: "/people/$personId", params: { personId: id } })}
          />
        </aside>
      </div>

      <EditPersonDialog open={editOpen} onOpenChange={setEditOpen} person={person} />
      {relation && (
        <AddRelativeDialog
          open={!!relation}
          onOpenChange={(o) => !o && setRelation(null)}
          relation={relation}
          person={person}
          idx={idx}
        />
      )}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {fullName(person)}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their details, photos and links to relatives will be removed. Their relatives stay in the tree.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete person
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function Fact({ label, value, sub, empty = "Not recorded" }: { label: string; value: string | null; sub?: string | null; empty?: string }) {
  return (
    <div>
      <dt className="font-sans text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1">
        {value || sub ? (
          <>
            <span className="block">{value || "Date unknown"}</span>
            {sub && <span className="block text-sm text-muted-foreground">{sub}</span>}
          </>
        ) : (
          <span className="text-muted-foreground">{empty}</span>
        )}
      </dd>
    </div>
  );
}
