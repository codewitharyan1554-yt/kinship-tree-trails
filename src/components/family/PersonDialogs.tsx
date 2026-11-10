import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  addRelationship,
  createPerson,
  refreshTree,
  updatePerson,
  type Person,
  type PersonFields,
  type Relation,
} from "@/lib/family-data";
import { fullName, lifeSpan, otherPartner, type TreeIndex } from "@/lib/relations";
import { cn } from "@/lib/utils";
import { emptyPerson, PersonFieldsForm } from "./PersonFields";

const relationLabel: Record<Relation, string> = {
  parent: "parent",
  partner: "partner",
  child: "child",
  sibling: "brother or sister",
};

function pickFields(p: Person): PersonFields {
  return {
    given_name: p.given_name,
    surname: p.surname,
    sex: p.sex,
    birth_date: p.birth_date,
    birth_place: p.birth_place,
    death_date: p.death_date,
    death_place: p.death_place,
    notes: p.notes,
  };
}

export function NewPersonDialog({
  open,
  onOpenChange,
  treeId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  treeId: string;
  onCreated?: (p: Person) => void;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState(emptyPerson());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setValue(emptyPerson());
  }, [open]);

  async function save() {
    if (!value.given_name.trim() && !value.surname.trim()) {
      toast.error("Add at least a name");
      return;
    }
    setBusy(true);
    try {
      const p = await createPerson(treeId, value);
      await refreshTree(qc, treeId);
      toast.success(`${fullName(p)} added`);
      onOpenChange(false);
      onCreated?.(p);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a person</DialogTitle>
          <DialogDescription>You can connect them to relatives afterwards.</DialogDescription>
        </DialogHeader>
        <PersonFieldsForm value={value} onChange={setValue} />
        <DialogFooter>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Add person"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditPersonDialog({
  open,
  onOpenChange,
  person,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  person: Person;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState(pickFields(person));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setValue(pickFields(person));
  }, [open, person]);

  async function save() {
    setBusy(true);
    try {
      await updatePerson(person.id, value);
      await refreshTree(qc, person.tree_id);
      toast.success("Saved");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {fullName(person)}</DialogTitle>
          <DialogDescription>Dates can be exact or approximate, like “ABT 1920”.</DialogDescription>
        </DialogHeader>
        <PersonFieldsForm value={value} onChange={setValue} />
        <DialogFooter>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddRelativeDialog({
  open,
  onOpenChange,
  relation,
  person,
  idx,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  relation: Relation;
  person: Person;
  idx: TreeIndex<Person>;
  onAdded?: (relativeId: string) => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"new" | "existing">("new");
  const [value, setValue] = useState(emptyPerson());
  const [existingId, setExistingId] = useState<string | null>(null);
  const [familyId, setFamilyId] = useState<string>("none");
  const [busy, setBusy] = useState(false);

  const partnerFamilies = useMemo(
    () => (idx.partnerFamilies.get(person.id) ?? []).filter((f) => otherPartner(f, person.id)),
    [idx, person.id],
  );

  useEffect(() => {
    if (!open) return;
    const surname = relation === "child" || relation === "sibling" ? person.surname : "";
    const sex = relation === "partner" && person.sex !== "U" ? (person.sex === "M" ? "F" : "M") : "U";
    setValue(emptyPerson({ surname, sex }));
    setTab("new");
    setExistingId(null);
    setFamilyId(partnerFamilies[0]?.id ?? "none");
  }, [open, relation, person, partnerFamilies]);

  const candidates = useMemo(
    () => idx.people.filter((p) => p.id !== person.id).sort((a, b) => fullName(a).localeCompare(fullName(b))),
    [idx.people, person.id],
  );

  async function save() {
    setBusy(true);
    try {
      let relativeId: string;
      if (tab === "existing") {
        if (!existingId) throw new Error("Choose someone from the list");
        relativeId = existingId;
      } else {
        if (!value.given_name.trim() && !value.surname.trim()) throw new Error("Add at least a name");
        relativeId = (await createPerson(person.tree_id, value)).id;
      }
      try {
        await addRelationship(
          idx,
          person.tree_id,
          person.id,
          relation,
          relativeId,
          relation === "child" && familyId !== "none" ? familyId : null,
        );
      } finally {
        await refreshTree(qc, person.tree_id);
      }
      toast.success(`Added ${relationLabel[relation]}`);
      onOpenChange(false);
      onAdded?.(relativeId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a {relationLabel[relation]} of {fullName(person)}</DialogTitle>
          <DialogDescription>Create someone new, or link a person already in this tree.</DialogDescription>
        </DialogHeader>

        {relation === "child" && partnerFamilies.length > 0 && (
          <div className="space-y-1.5">
            <Label>Other parent</Label>
            <Select value={familyId} onValueChange={setFamilyId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {partnerFamilies.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {fullName(idx.personById.get(otherPartner(f, person.id)!))}
                  </SelectItem>
                ))}
                <SelectItem value="none">Unknown / not listed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as "new" | "existing")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="new">New person</TabsTrigger>
            <TabsTrigger value="existing" disabled={candidates.length === 0}>Already in tree</TabsTrigger>
          </TabsList>
          <TabsContent value="new" className="pt-3">
            <PersonFieldsForm value={value} onChange={setValue} />
          </TabsContent>
          <TabsContent value="existing" className="pt-3">
            <Command className="rounded-md border border-border">
              <CommandInput placeholder="Search by name…" />
              <CommandList className="max-h-64">
                <CommandEmpty>No one found.</CommandEmpty>
                {candidates.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`${fullName(p)} ${p.id}`}
                    onSelect={() => setExistingId(p.id)}
                    className={cn(existingId === p.id && "bg-primary/10 text-foreground")}
                  >
                    <span className="flex-1">{fullName(p)}</span>
                    <span className="text-xs text-muted-foreground">{lifeSpan(p)}</span>
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : `Add ${relationLabel[relation]}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
