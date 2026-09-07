import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LatidoSesion from "@/components/LatidoSesion";
import Sidebar from "@/components/nav/Sidebar";
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
    <div className="flex min-h-screen">
      <LatidoSesion />
      <CommandPalette hideTrigger />
      <Sidebar nombre={nombre} rol={rol} mostrarRol={mostrarRol} />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
