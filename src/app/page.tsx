import { redirect } from "next/navigation";

// La raíz redirige a la gestión de usuarios; el middleware manda al login si
// no hay sesión.
export default function Home() {
  redirect("/usuarios");
}
