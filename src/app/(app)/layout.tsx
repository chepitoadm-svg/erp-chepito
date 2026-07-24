import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cerrarSesion } from "./actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Red de seguridad además del middleware.
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("nombre_completo, rol_id")
    .eq("id", user.id)
    .single();

  let rol = "Sin rol";
  if (perfil?.rol_id) {
    const { data: r } = await supabase
      .from("roles")
      .select("nombre")
      .eq("id", perfil.rol_id)
      .single();
    rol = r?.nombre ?? "Sin rol";
  }

  const nombre = perfil?.nombre_completo || user.email;

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="font-semibold text-neutral-900">ERP Chepito</span>
            <nav className="flex gap-4 text-sm">
              <Link
                href="/asientos"
                className="text-neutral-600 hover:text-neutral-900"
              >
                Asientos
              </Link>
              <Link
                href="/reportes"
                className="text-neutral-600 hover:text-neutral-900"
              >
                Reportes
              </Link>
              <Link
                href="/usuarios"
                className="text-neutral-600 hover:text-neutral-900"
              >
                Usuarios
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-right">
              <div className="font-medium text-neutral-900">{nombre}</div>
              <div className="text-xs text-neutral-500">{rol}</div>
            </div>
            <form action={cerrarSesion}>
              <button
                type="submit"
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-neutral-700 hover:bg-neutral-50"
              >
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
