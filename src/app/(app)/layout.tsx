import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cerrarSesion } from "./actions";
import LatidoSesion from "@/components/LatidoSesion";
import TopNav from "@/components/nav/TopNav";
import CommandPalette from "@/components/nav/CommandPalette";

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

  const nombre = perfil?.nombre_completo || user.email || "";
  // Evitar "Administrador / Administrador": solo mostrar el rol si difiere del nombre.
  const mostrarRol = rol !== "Sin rol" && rol !== nombre;

  return (
    <div className="min-h-screen">
      <LatidoSesion />
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="whitespace-nowrap font-semibold text-neutral-900">ERP Chepito</span>
            <CommandPalette />
          </div>

          <TopNav />

          <div className="flex items-center gap-4 text-sm">
            <div className="text-right leading-tight">
              <div className="font-medium text-neutral-900">{nombre}</div>
              {mostrarRol && <div className="text-xs text-neutral-500">{rol}</div>}
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
