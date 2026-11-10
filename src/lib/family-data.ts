import { queryOptions, type QueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { parseGedcom } from "./gedcom";
import { otherPartner, partnerIds, type TreeIndex } from "./relations";

export type Tree = Tables<"trees">;
export type Person = Tables<"people">;
export type Family = Tables<"families">;
export type FamilyChild = Tables<"family_children">;

export type PersonFields = Pick<
  Person,
  | "given_name"
  | "surname"
  | "sex"
  | "birth_date"
  | "birth_place"
  | "death_date"
  | "death_place"
  | "notes"
>;

export interface TreeData {
  tree: Tree;
  people: Person[];
  families: Family[];
  links: FamilyChild[];
}

const PAGE = 1000;

async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: Error | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export const treesQuery = () =>
  queryOptions({
    queryKey: ["trees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trees")
        .select("*, people(count)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((t) => {
        const { people, ...tree } = t as Tree & { people: { count: number }[] };
        return { ...tree, peopleCount: people?.[0]?.count ?? 0 };
      });
    },
  });

export const treeDataQuery = (treeId: string) =>
  queryOptions({
    queryKey: ["tree", treeId],
    queryFn: async (): Promise<TreeData> => {
      const { data: tree, error } = await supabase
        .from("trees")
        .select("*")
        .eq("id", treeId)
        .maybeSingle();
      if (error) throw error;
      if (!tree) throw new Error("Tree not found");
      const [people, families, links] = await Promise.all([
        fetchAll<Person>((a, b) =>
          supabase.from("people").select("*").eq("tree_id", treeId).order("created_at").range(a, b),
        ),
        fetchAll<Family>((a, b) =>
          supabase.from("families").select("*").eq("tree_id", treeId).order("created_at").range(a, b),
        ),
        fetchAll<FamilyChild>((a, b) =>
          supabase
            .from("family_children")
            .select("*")
            .eq("tree_id", treeId)
            .order("created_at")
            .range(a, b),
        ),
      ]);
      return { tree, people, families, links };
    },
  });

export const personQuery = (personId: string) =>
  queryOptions({
    queryKey: ["person", personId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("people")
        .select("*")
        .eq("id", personId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Person not found");
      return data;
    },
  });

export async function refreshTree(qc: QueryClient, treeId: string) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ["tree", treeId] }),
    qc.invalidateQueries({ queryKey: ["friends", treeId] }),
    qc.invalidateQueries({ queryKey: ["person"] }),
    qc.invalidateQueries({ queryKey: ["trees"] }),
  ]);
}

// ---------- Trees ----------

export async function createTree(name: string, description?: string) {
  const { data, error } = await supabase
    .from("trees")
    .insert({ name, description: description || null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function renameTree(treeId: string, name: string) {
  const { error } = await supabase.from("trees").update({ name }).eq("id", treeId);
  if (error) throw error;
}

export async function deleteTree(userId: string, treeId: string) {
  // Best-effort cleanup of the tree's photos
  try {
    const { data: folders } = await supabase.storage.from("photos").list(`${userId}/${treeId}`);
    for (const folder of folders ?? []) {
      const prefix = `${userId}/${treeId}/${folder.name}`;
      const { data: files } = await supabase.storage.from("photos").list(prefix);
      const paths = (files ?? []).map((f) => `${prefix}/${f.name}`);
      if (paths.length) await supabase.storage.from("photos").remove(paths);
    }
  } catch {
    // ignore storage cleanup failures
  }
  const { error } = await supabase.from("trees").delete().eq("id", treeId);
  if (error) throw error;
}

// ---------- People ----------

export async function createPerson(treeId: string, fields: PersonFields) {
  const { data, error } = await supabase
    .from("people")
    .insert({ ...fields, tree_id: treeId })
    .select()
    .single();
  if (error) throw error;
  await touchTree(treeId);
  return data;
}

export async function updatePerson(personId: string, fields: Partial<Person>) {
  const { error } = await supabase.from("people").update(fields).eq("id", personId);
  if (error) throw error;
}

export async function deletePerson(userId: string, person: Person, idx: TreeIndex) {
  const fams = idx.partnerFamilies.get(person.id) ?? [];
  try {
    const prefix = `${userId}/${person.tree_id}/${person.id}`;
    const { data: files } = await supabase.storage.from("photos").list(prefix);
    const paths = (files ?? []).map((f) => `${prefix}/${f.name}`);
    if (paths.length) await supabase.storage.from("photos").remove(paths);
  } catch {
    // ignore
  }
  const { error } = await supabase.from("people").delete().eq("id", person.id);
  if (error) throw error;
  // Remove couples left with no one in them
  const empty = fams
    .filter((f) => !otherPartner(f, person.id) && (idx.childrenOfFamily.get(f.id) ?? []).length === 0)
    .map((f) => f.id);
  if (empty.length) await supabase.from("families").delete().in("id", empty);
}

async function touchTree(treeId: string) {
  await supabase.from("trees").update({ updated_at: new Date().toISOString() }).eq("id", treeId);
}

// ---------- Relationships ----------

export type Relation = "parent" | "partner" | "child" | "sibling";

type PartnerCol = "partner1_id" | "partner2_id";
const slot = (col: PartnerCol, v: string | null) =>
  col === "partner1_id" ? { partner1_id: v } : { partner2_id: v };

async function insertFamily(row: TablesInsert<"families">) {
  const { data, error } = await supabase.from("families").insert(row).select().single();
  if (error) throw error;
  return data;
}

async function linkChild(treeId: string, familyId: string, childId: string) {
  const { error } = await supabase
    .from("family_children")
    .insert({ tree_id: treeId, family_id: familyId, child_id: childId });
  if (error) {
    if (error.code === "23505") throw new Error("They're already linked as parent and child.");
    throw error;
  }
}

/**
 * Connect `relativeId` to `personId` as the given relation.
 * For children, `familyId` chooses which couple they belong to
 * (null = this person alone / other parent unknown).
 */
export async function addRelationship(
  idx: TreeIndex,
  treeId: string,
  personId: string,
  relation: Relation,
  relativeId: string,
  familyId?: string | null,
) {
  if (personId === relativeId) throw new Error("A person can't be related to themselves.");

  if (relation === "parent") {
    const fam = idx.parentFamilies.get(personId)?.[0];
    if (fam) {
      if (partnerIds(fam).includes(relativeId)) throw new Error("Already a parent.");
      if (!fam.partner1_id) {
        await supabase.from("families").update({ partner1_id: relativeId }).eq("id", fam.id).throwOnError();
      } else if (!fam.partner2_id) {
        await supabase.from("families").update({ partner2_id: relativeId }).eq("id", fam.id).throwOnError();
      } else {
        throw new Error("This person already has two parents.");
      }
    } else {
      const f = await insertFamily({ tree_id: treeId, partner1_id: relativeId });
      await linkChild(treeId, f.id, personId);
    }
  }

  if (relation === "partner") {
    const fams = idx.partnerFamilies.get(personId) ?? [];
    if (fams.some((f) => otherPartner(f, personId) === relativeId))
      throw new Error("They're already partners.");
    const open = fams.find((f) => !otherPartner(f, personId));
    if (open) {
      const col: PartnerCol = open.partner1_id === personId ? "partner2_id" : "partner1_id";
      await supabase.from("families").update(slot(col, relativeId)).eq("id", open.id).throwOnError();
    } else {
      await insertFamily({ tree_id: treeId, partner1_id: personId, partner2_id: relativeId });
    }
  }

  if (relation === "child") {
    let fid = familyId ?? null;
    if (!fid) {
      const solo = (idx.partnerFamilies.get(personId) ?? []).find((f) => !otherPartner(f, personId));
      fid = solo ? solo.id : (await insertFamily({ tree_id: treeId, partner1_id: personId })).id;
    }
    await linkChild(treeId, fid, relativeId);
  }

  if (relation === "sibling") {
    const fam = idx.parentFamilies.get(personId)?.[0];
    if (fam) {
      await linkChild(treeId, fam.id, relativeId);
    } else {
      const f = await insertFamily({ tree_id: treeId });
      await linkChild(treeId, f.id, personId);
      await linkChild(treeId, f.id, relativeId);
    }
  }

  await touchTree(treeId);
}

export async function removeParentLink(familyId: string, childId: string) {
  await supabase
    .from("family_children")
    .delete()
    .eq("family_id", familyId)
    .eq("child_id", childId)
    .throwOnError();
}

export async function removeParentFromFamily(family: Family, parentId: string) {
  const col: PartnerCol = family.partner1_id === parentId ? "partner1_id" : "partner2_id";
  await supabase.from("families").update(slot(col, null)).eq("id", family.id).throwOnError();
}

export async function removePartnerLink(idx: TreeIndex, family: Family, personId: string) {
  const kids = idx.childrenOfFamily.get(family.id) ?? [];
  if (kids.length === 0) {
    await supabase.from("families").delete().eq("id", family.id).throwOnError();
    return;
  }
  // Keep the children attached to this person; just drop the partner
  const other = otherPartner(family, personId);
  const col: PartnerCol = family.partner1_id === other ? "partner1_id" : "partner2_id";
  await supabase.from("families").update(slot(col, null)).eq("id", family.id).throwOnError();
}

// ---------- Friends ----------

export type Friendship = Tables<"friendships">;
export interface FriendFields {
  friend_person_id: string | null;
  friend_name: string | null;
  how_met: string | null;
  notes: string | null;
}

export const friendshipsQuery = (treeId: string) =>
  queryOptions({
    queryKey: ["friends", treeId],
    queryFn: () =>
      fetchAll<Friendship>((a, b) =>
        supabase.from("friendships").select("*").eq("tree_id", treeId).order("created_at").range(a, b),
      ),
  });

export async function addFriend(treeId: string, personId: string, fields: FriendFields) {
  if (fields.friend_person_id === personId) throw new Error("A person can't be their own friend.");
  const { error } = await supabase
    .from("friendships")
    .insert({ ...fields, tree_id: treeId, person_id: personId });
  if (error) throw error;
  await touchTree(treeId);
}

export async function updateFriend(friendshipId: string, fields: Pick<FriendFields, "how_met" | "notes"> & { friend_name?: string | null }) {
  const { error } = await supabase.from("friendships").update(fields).eq("id", friendshipId);
  if (error) throw error;
}

export async function removeFriend(friendshipId: string) {
  const { error } = await supabase.from("friendships").delete().eq("id", friendshipId);
  if (error) throw error;
}

// ---------- GEDCOM import ----------

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function importGedcomFile(text: string, treeName: string) {
  const parsed = parseGedcom(text);
  if (parsed.people.length === 0) throw new Error("No people found in this file.");
  const tree = await createTree(treeName);
  try {
    const idFor = new Map(parsed.people.map((p) => [p.xref, crypto.randomUUID()]));
    const famIdFor = new Map(parsed.families.map((f) => [f.xref, crypto.randomUUID()]));
    const peopleRows: TablesInsert<"people">[] = parsed.people.map((p) => ({
      id: idFor.get(p.xref)!,
      tree_id: tree.id,
      given_name: p.given_name,
      surname: p.surname,
      sex: p.sex,
      birth_date: p.birth_date,
      birth_place: p.birth_place,
      death_date: p.death_date,
      death_place: p.death_place,
      notes: p.notes,
    }));
    for (const c of chunk(peopleRows, 500)) await supabase.from("people").insert(c).throwOnError();

    const famRows: TablesInsert<"families">[] = parsed.families.map((f) => ({
      id: famIdFor.get(f.xref)!,
      tree_id: tree.id,
      partner1_id: f.partner1 ? idFor.get(f.partner1)! : null,
      partner2_id: f.partner2 ? idFor.get(f.partner2)! : null,
      marriage_date: f.marriage_date,
      marriage_place: f.marriage_place,
    }));
    for (const c of chunk(famRows, 500)) await supabase.from("families").insert(c).throwOnError();

    const seen = new Set<string>();
    const linkRows: TablesInsert<"family_children">[] = [];
    for (const f of parsed.families) {
      for (const ch of f.children) {
        const key = `${f.xref}|${ch}`;
        if (seen.has(key)) continue;
        seen.add(key);
        linkRows.push({ tree_id: tree.id, family_id: famIdFor.get(f.xref)!, child_id: idFor.get(ch)! });
      }
    }
    for (const c of chunk(linkRows, 500))
      await supabase.from("family_children").insert(c).throwOnError();

    return { tree, people: peopleRows.length, families: famRows.length };
  } catch (e) {
    await supabase.from("trees").delete().eq("id", tree.id);
    throw e;
  }
}

// ---------- Photos ----------

export function photoFolder(userId: string, person: Pick<Person, "id" | "tree_id">) {
  return `${userId}/${person.tree_id}/${person.id}`;
}

export const personPhotosQuery = (userId: string, person: Pick<Person, "id" | "tree_id">) =>
  queryOptions({
    queryKey: ["photos", person.id],
    queryFn: async () => {
      const prefix = photoFolder(userId, person);
      const { data, error } = await supabase.storage
        .from("photos")
        .list(prefix, { sortBy: { column: "created_at", order: "desc" } });
      if (error) throw error;
      return (data ?? [])
        .filter((f) => f.name !== ".emptyFolderPlaceholder")
        .map((f) => `${prefix}/${f.name}`);
    },
  });

export const signedUrlsQuery = (paths: string[]) =>
  queryOptions({
    queryKey: ["signed-urls", [...paths].sort()],
    enabled: paths.length > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("photos").createSignedUrls(paths, 3600);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const d of data ?? []) if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
      return map;
    },
  });

export async function uploadPhoto(userId: string, person: Person, file: File) {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
  const path = `${photoFolder(userId, person)}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage
    .from("photos")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  if (!person.photo_path) await updatePerson(person.id, { photo_path: path });
  return path;
}

export async function deletePhoto(person: Person, path: string, remaining: string[]) {
  const { error } = await supabase.storage.from("photos").remove([path]);
  if (error) throw error;
  if (person.photo_path === path) {
    await updatePerson(person.id, { photo_path: remaining.find((p) => p !== path) ?? null });
  }
}
