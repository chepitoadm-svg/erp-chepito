"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  error?: string;
}

export async function iniciarSesion(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Ingresá correo y contraseña." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // El mensaje al usuario se mantiene genérico a propósito (no revelar si el
    // correo existe), pero el motivo real se registra para poder diagnosticar.
    console.error("[login] fallo signInWithPassword:", {
      status: error.status,
      code: error.code,
      message: error.message,
    });
    return { error: "Credenciales inválidas." };
  }

  redirect("/usuarios");
}
