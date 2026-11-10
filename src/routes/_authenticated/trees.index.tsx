import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { FileUp, Plus, Trash2, TreeDeciduous, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { createTree, deleteTree, importGedcomFile, treesQuery } from "@/lib/family-data";

export const Route = createFileRoute("/_authenticated/trees/")({
  head: () => ({
    meta: [
      { title: "My family trees — Vanshavali" },
      { name: "description", content: "All of your private family trees in one place." },
      { property: "og:title", content: "My family trees — Vanshavali" },
      { property: "og:description", content: "All of your private family trees in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(treesQuery()),
  component: TreesPage,
});

function TreesPage() {
  const { data: trees } = useSuspenseQuery(treesQuery());
  const { user } = useRouteContext({ from: "/_authenticated" });
  const qc = useQueryClient();
  const navigate = Route.useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);

  async function onCreate() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const t = await createTree(name.trim());
      await qc.invalidateQueries({ queryKey: ["trees"] });
      setCreating(false);
      setName("");
      navigate({ to: "/trees/$treeId", params: { treeId: t.id }, search: { focus: undefined } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create tree");
    } finally {
      setBusy(false);
    }
  }

  async function onImport(file: File) {
    const id = toast.loading(`Importing ${file.name}…`);
    try {
      const text = await file.text();
      const res = await importGedcomFile(text, file.name.replace(/\.ged(com)?$/i, "") || "Imported tree");
      await qc.invalidateQueries({ queryKey: ["trees"] });
      toast.success(`Imported ${res.people} people`, { id });
      navigate({ to: "/trees/$treeId", params: { treeId: res.tree.id }, search: { focus: undefined } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed", { id });
    }
  }

  async function onDelete() {
    if (!toDelete) return;
    try {
      await deleteTree(user.id, toDelete.id);
      await qc.invalidateQueries({ queryKey: ["trees"] });
      toast.success("Tree deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete");
    } finally {
      setToDelete(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Your family trees</h1>
          <p className="mt-1 text-muted-foreground">Only you can see these.</p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".ged,.gedcom,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = "";
            }}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <FileUp className="mr-2 h-4 w-4" /> Import GEDCOM
          </Button>
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" /> New tree
          </Button>
        </div>
      </div>

      {trees.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <TreeDeciduous className="mx-auto mb-4 h-10 w-10 text-primary" />
          <h2 className="text-xl font-semibold">Plant your first tree</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Start with yourself or an elder you know well, then add parents, partners and children around them.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button onClick={() => setCreating(true)}>Create a tree</Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()}>Import a GEDCOM file</Button>
          </div>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trees.map((t) => (
            <li key={t.id} className="group relative rounded-xl border border-border bg-card shadow-card transition-shadow hover:shadow-lg">
              <Link
                to="/trees/$treeId"
                params={{ treeId: t.id }}
                search={{ focus: undefined }}
                className="block p-5"
              >
                <TreeDeciduous className="mb-3 h-6 w-6 text-primary" />
                <h2 className="truncate pr-8 text-lg font-semibold">{t.name}</h2>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Users className="h-3.5 w-3.5" /> {t.peopleCount} {t.peopleCount === 1 ? "person" : "people"}
                  <span className="mx-1">·</span>
                  updated {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}
                </p>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-3 top-3 h-8 w-8 text-muted-foreground hover:text-destructive"
                aria-label={`Delete ${t.name}`}
                onClick={() => setToDelete({ id: t.id, name: t.name })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New family tree</DialogTitle>
            <DialogDescription>Give it a name, like “Sharma family” or “Nani's side”.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="tree-name">Name</Label>
            <Input id="tree-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onCreate()} />
          </div>
          <DialogFooter>
            <Button onClick={onCreate} disabled={busy || !name.trim()}>{busy ? "Creating…" : "Create tree"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{toDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Everyone in this tree, their relationships and photos will be removed for good. Export it as GEDCOM first if you want a copy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete tree
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
