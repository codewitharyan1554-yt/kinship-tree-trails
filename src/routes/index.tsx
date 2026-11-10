import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileDown, ImageIcon, Lock, Network } from "lucide-react";

import banyan from "@/assets/banyan-engraving.jpg";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/family/AppHeader";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vanshavali — A private home for your family tree" },
      {
        name: "description",
        content:
          "Map your family across generations: people, relationships, photos and GEDCOM import/export, kept private to your account.",
      },
      { property: "og:title", content: "Vanshavali — A private home for your family tree" },
      {
        property: "og:description",
        content: "Map your family across generations with an interactive tree, photos and GEDCOM support.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: Network, title: "An interactive tree", body: "Walk up to grandparents and down to grandchildren. Click anyone to centre the tree on them." },
  { icon: ImageIcon, title: "Profiles with photos", body: "Dates, places, notes and a photo album for every person." },
  { icon: FileDown, title: "GEDCOM in and out", body: "Bring a tree from another app, or take yours anywhere." },
  { icon: Lock, title: "Private by default", body: "Each tree belongs to your account. No one else can see it." },
];

function Landing() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        {signedIn ? (
          <Button asChild size="sm"><Link to="/trees">My trees</Link></Button>
        ) : (
          <Button asChild variant="ghost" size="sm">
            <Link to="/auth" search={{ redirect: undefined }}>Sign in</Link>
          </Button>
        )}
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-6 md:grid-cols-[1.05fr_1fr] md:pt-12">
          <div>
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-clay">Vanshavali · वंशावली</p>
            <h1 className="text-4xl font-semibold leading-[1.08] md:text-6xl">
              Every root, every branch, kept for the next generation.
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted-foreground">
              Record your family's people and stories, see how everyone connects, and keep it all private to you.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                {signedIn ? (
                  <Link to="/trees">Open my trees</Link>
                ) : (
                  <Link to="/auth" search={{ redirect: undefined }}>Start your tree — it's free</Link>
                )}
              </Button>
            </div>
          </div>
          <div className="relative">
            <img
              src={banyan}
              alt="Ink engraving of an old banyan tree with its roots"
              width={1280}
              height={1024}
              className="w-full rounded-2xl border border-border shadow-card"
            />
          </div>
        </section>

        <section className="border-t border-border bg-secondary/50">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.title}>
                <f.icon className="mb-3 h-6 w-6 text-primary" />
                <h2 className="text-lg font-semibold">{f.title}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-5 py-8 text-sm text-muted-foreground">
        © {new Date().getFullYear()} Vanshavali
      </footer>
    </div>
  );
}
