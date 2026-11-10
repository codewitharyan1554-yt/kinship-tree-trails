CREATE TABLE public.trees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL DEFAULT auth.uid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trees TO authenticated;
GRANT ALL ON public.trees TO service_role;
ALTER TABLE public.trees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their trees" ON public.trees
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
CREATE INDEX trees_owner_idx ON public.trees(owner_id);

CREATE TABLE public.people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id UUID NOT NULL REFERENCES public.trees(id) ON DELETE CASCADE,
  given_name TEXT NOT NULL DEFAULT '',
  surname TEXT NOT NULL DEFAULT '',
  sex TEXT NOT NULL DEFAULT 'U' CHECK (sex IN ('M','F','U')),
  birth_date TEXT,
  birth_place TEXT,
  death_date TEXT,
  death_place TEXT,
  notes TEXT,
  photo_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people TO authenticated;
GRANT ALL ON public.people TO service_role;
CREATE INDEX people_tree_idx ON public.people(tree_id);

CREATE TABLE public.families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id UUID NOT NULL REFERENCES public.trees(id) ON DELETE CASCADE,
  partner1_id UUID REFERENCES public.people(id) ON DELETE SET NULL,
  partner2_id UUID REFERENCES public.people(id) ON DELETE SET NULL,
  marriage_date TEXT,
  marriage_place TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.families TO authenticated;
GRANT ALL ON public.families TO service_role;
CREATE INDEX families_tree_idx ON public.families(tree_id);

CREATE TABLE public.family_children (
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  tree_id UUID NOT NULL REFERENCES public.trees(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (family_id, child_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_children TO authenticated;
GRANT ALL ON public.family_children TO service_role;
CREATE INDEX family_children_tree_idx ON public.family_children(tree_id);
CREATE INDEX family_children_child_idx ON public.family_children(child_id);

CREATE OR REPLACE FUNCTION public.owns_tree(_tree_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.trees WHERE id = _tree_id AND owner_id = auth.uid())
$$;
REVOKE EXECUTE ON FUNCTION public.owns_tree(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_tree(UUID) TO authenticated;

ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tree owners manage people" ON public.people
  FOR ALL TO authenticated
  USING (public.owns_tree(tree_id)) WITH CHECK (public.owns_tree(tree_id));

ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tree owners manage families" ON public.families
  FOR ALL TO authenticated
  USING (public.owns_tree(tree_id)) WITH CHECK (public.owns_tree(tree_id));

ALTER TABLE public.family_children ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tree owners manage family children" ON public.family_children
  FOR ALL TO authenticated
  USING (public.owns_tree(tree_id)) WITH CHECK (public.owns_tree(tree_id));

-- Keep every link inside one tree
CREATE OR REPLACE FUNCTION public.check_family_same_tree()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.partner1_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.people WHERE id = NEW.partner1_id AND tree_id = NEW.tree_id) THEN
    RAISE EXCEPTION 'Partner must belong to the same tree';
  END IF;
  IF NEW.partner2_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.people WHERE id = NEW.partner2_id AND tree_id = NEW.tree_id) THEN
    RAISE EXCEPTION 'Partner must belong to the same tree';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER families_same_tree BEFORE INSERT OR UPDATE ON public.families
  FOR EACH ROW EXECUTE FUNCTION public.check_family_same_tree();

CREATE OR REPLACE FUNCTION public.check_child_same_tree()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.families WHERE id = NEW.family_id AND tree_id = NEW.tree_id)
     OR NOT EXISTS (SELECT 1 FROM public.people WHERE id = NEW.child_id AND tree_id = NEW.tree_id) THEN
    RAISE EXCEPTION 'Child and family must belong to the same tree';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER family_children_same_tree BEFORE INSERT OR UPDATE ON public.family_children
  FOR EACH ROW EXECUTE FUNCTION public.check_child_same_tree();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER trees_touch BEFORE UPDATE ON public.trees FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER people_touch BEFORE UPDATE ON public.people FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Private photo storage: files live under <user_id>/...
CREATE POLICY "Users read own photos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users upload own photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users update own photos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own photos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text);