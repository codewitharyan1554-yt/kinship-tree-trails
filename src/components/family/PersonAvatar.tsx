import { cn } from "@/lib/utils";
import { initials, type PersonLike } from "@/lib/relations";

const sexTone: Record<string, string> = {
  M: "bg-male/15 text-male",
  F: "bg-female/15 text-female",
  U: "bg-unknown/20 text-muted-foreground",
};

export function PersonAvatar({
  person,
  url,
  className,
}: {
  person: Pick<PersonLike, "given_name" | "surname" | "sex">;
  url?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold",
        sexTone[person.sex] ?? sexTone.U,
        className,
      )}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <span>{initials(person)}</span>
      )}
    </span>
  );
}
