import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // If arriving with an OAuth error in URL hash or search, redirect to /auth with the error
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      const search = window.location.search;
      if (hash.includes("error=") || search.includes("error=")) {
        const params = new URLSearchParams(hash.replace(/^#/, "") || search);
        const errorDesc = params.get("error_description") || params.get("error");
        if (errorDesc) {
          throw redirect({
            to: "/auth",
            search: { error: errorDesc },
          });
        }
      }
    }

    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: () => <Outlet />,
});
