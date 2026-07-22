// Cliente de Supabase con service_role. BYPASSEA RLS: usar SOLO en el servidor
// y SOLO después de verificar los permisos del usuario que hace la petición
// (ver requerirPermiso en @/lib/auth/permisos). Nunca importar desde el browser.
//
// Se usa para operaciones que la API pública no permite, como crear usuarios de
// Auth (admin.createUser).
import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY. Configurala en .env.local (nunca se expone al browser).",
    );
  }

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
