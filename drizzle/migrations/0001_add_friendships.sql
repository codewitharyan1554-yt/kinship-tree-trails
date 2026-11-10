CREATE TABLE public.friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id UUID NOT NULL REFERENCES public.trees(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  friend_person_id UUID REFERENCES public.people(id) ON DELETE CASCADE,
  friend_name TEXT,
  how_met TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT friendships_has_friend CHECK (friend_person_id IS NOT NULL OR coalesce(btrim(friend_name), '') <> ''),
  CONSTRAINT friendships_not_self CHECK (friend_person_id IS NULL OR friend_person_id <> person_id)
);
CREATE INDEX friendships_tree_idx ON public.friendships(tree_id);
CREATE INDEX friendships_person_idx ON public.friendships(person_id);
CREATE INDEX friendships_friend_person_idx ON public.friendships(friend_person_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendships TO authenticated;
GRANT ALL ON public.friendships TO service_role;

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tree owners manage friendships" ON public.friendships
  FOR ALL TO authenticated
  USING (public.owns_tree(tree_id)) WITH CHECK (public.owns_tree(tree_id));

CREATE OR REPLACE FUNCTION public.check_friendship_same_tree()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.people WHERE id = NEW.person_id AND tree_id = NEW.tree_id) THEN
    RAISE EXCEPTION 'Person must belong to the same tree';
  END IF;
  IF NEW.friend_person_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.people WHERE id = NEW.friend_person_id AND tree_id = NEW.tree_id) THEN
    RAISE EXCEPTION 'Friend must belong to the same tree';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER friendships_same_tree BEFORE INSERT OR UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.check_friendship_same_tree();