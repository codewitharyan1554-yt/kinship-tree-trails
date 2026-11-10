<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules

- Family data model follows GEDCOM: `people`, `families` (a couple of up to two partners), `family_children` (child links). Why: maps 1:1 to GEDCOM import/export and handles remarriage, single parents and siblings.
- Privacy is enforced by RLS: every row carries `tree_id` and policies call `public.owns_tree(tree_id)`; photos live in the private `photos` bucket under `<user_id>/<tree_id>/<person_id>/` and are shown via signed URLs. Why: each family's data must stay private to its owner.
- Friends live in `friendships` (person → another person in the tree, or a typed-in name), outside the GEDCOM family model and not drawn in the tree; pure read helpers in `src/lib/friends.ts`, query key `["friends", treeId]`. Why: keeps family structure and GEDCOM export unaffected.
- Dates are stored as free text (e.g. "ABT 1920"). Why: genealogy dates are often approximate and GEDCOM keeps them as text.
- Data access goes through the browser client in `src/lib/family-data.ts` with React Query keys `["tree", id]`, `["trees"]`, `["person", id]`. Why: RLS already scopes every read/write to the signed-in user.
- Tree drawing is a custom hourglass layout in `src/lib/tree-layout.ts` (pure, unit-tested) rendered by `TreeCanvas`. Why: keeps layout logic testable and free of heavy chart libraries.
