import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PersonFields as Fields } from "@/lib/family-data";

export const emptyPerson = (overrides: Partial<Fields> = {}): Fields => ({
  given_name: "",
  surname: "",
  sex: "U",
  birth_date: null,
  birth_place: null,
  death_date: null,
  death_place: null,
  notes: null,
  ...overrides,
});

export function PersonFieldsForm({ value, onChange }: { value: Fields; onChange: (v: Fields) => void }) {
  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => onChange({ ...value, [k]: v });
  const text = (k: keyof Fields) => ({
    value: (value[k] as string | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      set(k, (e.target.value || (k === "given_name" || k === "surname" ? "" : null)) as never),
  });

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pf-given">Given name</Label>
          <Input id="pf-given" autoFocus {...text("given_name")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-surname">Surname</Label>
          <Input id="pf-surname" {...text("surname")} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Sex</Label>
        <Select value={value.sex} onValueChange={(v) => set("sex", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="M">Male</SelectItem>
            <SelectItem value="F">Female</SelectItem>
            <SelectItem value="U">Unknown</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pf-bd">Born</Label>
          <Input id="pf-bd" placeholder="e.g. 12 MAR 1932 or ABT 1920" {...text("birth_date")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-bp">Birthplace</Label>
          <Input id="pf-bp" placeholder="e.g. Lahore, Punjab" {...text("birth_place")} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pf-dd">Died</Label>
          <Input id="pf-dd" placeholder="Leave empty if living" {...text("death_date")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-dp">Place of death</Label>
          <Input id="pf-dp" {...text("death_place")} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pf-notes">Notes</Label>
        <Textarea id="pf-notes" rows={3} placeholder="Stories, occupation, anything worth remembering" {...text("notes")} />
      </div>
    </div>
  );
}
