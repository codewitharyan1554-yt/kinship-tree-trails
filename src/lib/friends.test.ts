import { describe, expect, it } from "vitest";
import { areFriends, friendsOf, type FriendshipLike } from "./friends";

const names: Record<string, string> = { a: "Ram Sharma", b: "Mohan Lal", c: "Sita Devi" };
const nameOf = (id: string) => names[id] ?? "Unknown";

const row = (r: Partial<FriendshipLike> & { id: string; person_id: string }): FriendshipLike => ({
  friend_person_id: null,
  friend_name: null,
  how_met: null,
  notes: null,
  ...r,
});

describe("friendsOf", () => {
  it("shows a friendship with someone in the tree on both people's profiles", () => {
    const rows = [row({ id: "f1", person_id: "a", friend_person_id: "b", how_met: "School" })];
    expect(friendsOf(rows, "a", nameOf)).toEqual([
      { friendshipId: "f1", personId: "b", name: "Mohan Lal", howMet: "School", notes: null },
    ]);
    expect(friendsOf(rows, "b", nameOf)[0]?.personId).toBe("a");
    expect(friendsOf(rows, "c", nameOf)).toEqual([]);
  });

  it("shows a typed-in friend only on the profile it was added to", () => {
    const rows = [row({ id: "f2", person_id: "a", friend_name: "  Abdul Kareem " })];
    expect(friendsOf(rows, "a", nameOf).map((f) => f.name)).toEqual(["Abdul Kareem"]);
    expect(friendsOf(rows, "b", nameOf)).toEqual([]);
  });

  it("lists the same tree person once even if linked from both sides", () => {
    const rows = [
      row({ id: "f1", person_id: "a", friend_person_id: "b" }),
      row({ id: "f2", person_id: "b", friend_person_id: "a" }),
    ];
    expect(friendsOf(rows, "a", nameOf)).toHaveLength(1);
  });
});

describe("areFriends", () => {
  it("matches in either direction", () => {
    const rows = [row({ id: "f1", person_id: "a", friend_person_id: "b" })];
    expect(areFriends(rows, "b", "a")).toBe(true);
    expect(areFriends(rows, "a", "c")).toBe(false);
  });
});
