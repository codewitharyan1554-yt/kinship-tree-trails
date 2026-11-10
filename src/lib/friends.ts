// Pure helpers for a person's friends. A friendship row links a person either to
// someone else in the same tree (friend_person_id) or to a name typed in (friend_name).

export interface FriendshipLike {
  id: string;
  person_id: string;
  friend_person_id: string | null;
  friend_name: string | null;
  how_met: string | null;
  notes: string | null;
}

export interface FriendEntry {
  friendshipId: string;
  /** Set when the friend is also a person in this tree */
  personId: string | null;
  name: string;
  howMet: string | null;
  notes: string | null;
}

/**
 * Friends of `personId`. Links to people in the tree count in both directions,
 * so a friendship added on one profile also shows on the other.
 */
export function friendsOf(
  rows: FriendshipLike[],
  personId: string,
  nameOf: (id: string) => string,
): FriendEntry[] {
  const out: FriendEntry[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    let otherId: string | null;
    if (r.person_id === personId) otherId = r.friend_person_id;
    else if (r.friend_person_id === personId) otherId = r.person_id;
    else continue;
    if (otherId) {
      if (seen.has(otherId)) continue;
      seen.add(otherId);
    }
    out.push({
      friendshipId: r.id,
      personId: otherId,
      name: otherId ? nameOf(otherId) : (r.friend_name ?? "").trim() || "Unnamed",
      howMet: r.how_met,
      notes: r.notes,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** True if the two people in the tree are already linked as friends (either direction). */
export function areFriends(rows: FriendshipLike[], a: string, b: string): boolean {
  return rows.some(
    (r) =>
      (r.person_id === a && r.friend_person_id === b) ||
      (r.person_id === b && r.friend_person_id === a),
  );
}
