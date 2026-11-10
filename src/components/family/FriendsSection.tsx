import { useEffect, useMemo, useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Pencil, Plus, X } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  addFriend,
  friendshipsQuery,
  removeFriend,
  updateFriend,
  type Person,
} from "@/lib/family-data";
import { areFriends, friendsOf, type FriendEntry } from "@/lib/friends";
import { fullName, lifeSpan, type TreeIndex } from "@/lib/relations";
import { cn } from "@/lib/utils";
import { PersonAvatar } from "./PersonAvatar";

export function FriendsSection({
  idx,
  person,
  photoUrls,
  onPick,
}: {
  idx: TreeIndex<Person>;
  person: Person;
  photoUrls: Record<string, string>;
  onPick: (id: string) => void;
}) {
  const qc = useQueryClient();
  const q = useQuery(friendshipsQuery(person.tree_id));
  const rows = useMemo(() => q.data ?? [], [q.data]);
  const friends = useMemo(
    () => friendsOf(rows, person.id, (id) => fullName(idx.personById.get(id))),
    [rows, person.id, idx],
  );
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FriendEntry | null>(null);

  async function onRemove(f: FriendEntry) {
    try {
      await removeFriend(f.friendshipId);
      await qc.invalidateQueries({ queryKey: ["friends", person.tree_id] });
      toast.success(`${f.name} removed from friends`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove friend");
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Friends</h2>
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : friends.length === 0 ? (
        <p className="text-sm text-muted-foreground/80">
          No friends added yet. Add close friends, neighbours or anyone who mattered in {person.given_name || "their"}
          {person.given_name ? "’s" : ""} life.
        </p>
      ) : (
        <ul className="space-y-1">
          {friends.map((f) => {
            const p = f.personId ? idx.personById.get(f.personId) : undefined;
            const avatar = p ?? { given_name: f.name, surname: "", sex: "U" };
            const url = p?.photo_path ? photoUrls[p.photo_path] : null;
            const body = (
              <>
                <PersonAvatar person={avatar} url={url} className="h-8 w-8 text-xs" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{f.name}</span>
                  {f.howMet && <span className="block truncate text-xs text-muted-foreground">{f.howMet}</span>}
                  {f.notes && <span className="mt-0.5 block whitespace-pre-wrap text-xs text-muted-foreground/90">{f.notes}</span>}
                </span>
              </>
            );
            return (
              <li key={f.friendshipId} className="flex items-start gap-1">
                {f.personId ? (
                  <button
                    type="button"
                    onClick={() => onPick(f.personId!)}
                    className="flex min-w-0 flex-1 items-start gap-2.5 rounded-md px-1.5 py-1.5 text-left hover:bg-secondary"
                  >
                    {body}
                  </button>
                ) : (
                  <div className="flex min-w-0 flex-1 items-start gap-2.5 px-1.5 py-1.5">{body}</div>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-60 hover:opacity-100"
                  aria-label={`Edit friend ${f.name}`}
                  onClick={() => setEditing(f)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-60 hover:opacity-100"
                  aria-label={`Remove friend ${f.name}`}
                  onClick={() => onRemove(f)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <FriendDialog
        open={adding || !!editing}
        onOpenChange={(o) => {
          if (!o) {
            setAdding(false);
            setEditing(null);
          }
        }}
        person={person}
        idx={idx}
        rows={rows}
        editing={editing}
      />
    </section>
  );
}

function FriendDialog({
  open,
  onOpenChange,
  person,
  idx,
  rows,
  editing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  person: Person;
  idx: TreeIndex<Person>;
  rows: Parameters<typeof areFriends>[0];
  editing: FriendEntry | null;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"new" | "existing">("new");
  const [name, setName] = useState("");
  const [existingId, setExistingId] = useState<string | null>(null);
  const [howMet, setHowMet] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab("new");
    setExistingId(null);
    setName(editing && !editing.personId ? editing.name : "");
    setHowMet(editing?.howMet ?? "");
    setNotes(editing?.notes ?? "");
  }, [open, editing]);

  const candidates = useMemo(
    () =>
      idx.people
        .filter((p) => p.id !== person.id && !areFriends(rows, person.id, p.id))
        .sort((a, b) => fullName(a).localeCompare(fullName(b))),
    [idx.people, person.id, rows],
  );

  async function save() {
    setBusy(true);
    try {
      const how_met = howMet.trim() || null;
      const n = notes.trim() || null;
      if (editing) {
        if (!editing.personId && !name.trim()) throw new Error("Add a name");
        await updateFriend(editing.friendshipId, {
          how_met,
          notes: n,
          ...(editing.personId ? {} : { friend_name: name.trim() }),
        });
      } else if (tab === "existing") {
        if (!existingId) throw new Error("Choose someone from the list");
        await addFriend(person.tree_id, person.id, { friend_person_id: existingId, friend_name: null, how_met, notes: n });
      } else {
        if (!name.trim()) throw new Error("Add a name");
        await addFriend(person.tree_id, person.id, { friend_person_id: null, friend_name: name.trim(), how_met, notes: n });
      }
      await qc.invalidateQueries({ queryKey: ["friends", person.tree_id] });
      toast.success(editing ? "Friend updated" : "Friend added");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  const details = (
    <div className="grid gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="fr-how">How they knew each other</Label>
        <Input id="fr-how" placeholder="e.g. School friend in Lahore, neighbour, army colleague" value={howMet} onChange={(e) => setHowMet(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="fr-notes">Notes</Label>
        <Textarea id="fr-notes" rows={3} placeholder="Stories or memories about their friendship" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </div>
  );

  const nameField = (
    <div className="space-y-1.5">
      <Label htmlFor="fr-name">Friend’s name</Label>
      <Input id="fr-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit friend ${editing.name}` : `Add a friend of ${fullName(person)}`}</DialogTitle>
          <DialogDescription>
            Friends appear on this profile but aren’t drawn in the family tree.
          </DialogDescription>
        </DialogHeader>

        {editing ? (
          <div className="grid gap-3">
            {!editing.personId && nameField}
            {details}
          </div>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as "new" | "existing")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="new">Type a name</TabsTrigger>
              <TabsTrigger value="existing" disabled={candidates.length === 0}>Already in tree</TabsTrigger>
            </TabsList>
            <TabsContent value="new" className="grid gap-3 pt-3">
              {nameField}
              {details}
            </TabsContent>
            <TabsContent value="existing" className="grid gap-3 pt-3">
              <Command className="rounded-md border border-border">
                <CommandInput placeholder="Search by name…" />
                <CommandList className="max-h-48">
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
              {details}
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : editing ? "Save changes" : "Add friend"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
