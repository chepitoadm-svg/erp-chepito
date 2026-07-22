// Cliente de Supabase para el servidor (Server Components, Server Actions,
// Route Handlers). Usa la llave anon + la sesión del usuario vía cookies, así
// que TODA operación queda sujeta a RLS con la identidad real del usuario.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `setAll` desde un Server Component: se ignora. El refresco de la
            // sesión lo maneja el middleware.
          }
        },
      },
    },
  );
}
