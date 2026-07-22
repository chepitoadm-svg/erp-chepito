// =============================================================================
// Tipos del esquema public. Escritos a mano para la Fase 1 (Fundación).
// Se pueden regenerar desde el proyecto enlazado con:  npm run db:types
// =============================================================================

export type Estado = "activo" | "inactivo";

export interface Database {
  public: {
    Tables: {
      empresa: {
        Row: {
          id: string;
          razon_social: string;
          nombre_comercial: string | null;
          cedula_juridica: string | null;
          moneda_base: string;
          estado: Estado;
          creado_en: string;
          creado_por: string | null;
          actualizado_en: string | null;
          actualizado_por: string | null;
        };
        Insert: {
          razon_social: string;
          nombre_comercial?: string | null;
          cedula_juridica?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["empresa"]["Insert"]>;
      };
      sucursales: {
        Row: {
          id: string;
          codigo: string;
          nombre: string;
          tipo: "punto_venta" | "produccion" | "administracion";
          estado: Estado;
          creado_en: string;
          creado_por: string | null;
          actualizado_en: string | null;
          actualizado_por: string | null;
        };
        Insert: {
          codigo: string;
          nombre: string;
          tipo: "punto_venta" | "produccion" | "administracion";
        };
        Update: Partial<Database["public"]["Tables"]["sucursales"]["Insert"]>;
      };
      bodegas: {
        Row: {
          id: string;
          sucursal_id: string;
          codigo: string;
          nombre: string;
          tipo: "materia_prima" | "producto_terminado" | "general";
          estado: Estado;
          creado_en: string;
          creado_por: string | null;
          actualizado_en: string | null;
          actualizado_por: string | null;
        };
        Insert: {
          sucursal_id: string;
          codigo: string;
          nombre: string;
          tipo: "materia_prima" | "producto_terminado" | "general";
        };
        Update: Partial<Database["public"]["Tables"]["bodegas"]["Insert"]>;
      };
      cuentas: {
        Row: {
          id: string;
          codigo: string;
          nombre: string;
          cuenta_padre_id: string | null;
          nivel: number;
          tipo: "activo" | "pasivo" | "patrimonio" | "ingreso" | "gasto";
          naturaleza: "deudora" | "acreedora";
          acepta_movimiento: boolean;
          estado: Estado;
          creado_en: string;
          creado_por: string | null;
          actualizado_en: string | null;
          actualizado_por: string | null;
        };
        Insert: {
          codigo: string;
          nombre: string;
          cuenta_padre_id?: string | null;
          nivel: number;
          tipo: "activo" | "pasivo" | "patrimonio" | "ingreso" | "gasto";
          naturaleza: "deudora" | "acreedora";
          acepta_movimiento?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["cuentas"]["Insert"]>;
      };
      periodos_contables: {
        Row: {
          id: string;
          anio: number;
          mes: number;
          fecha_inicio: string;
          fecha_fin: string;
          estado: "abierto" | "cerrado" | "bloqueado";
          cerrado_por: string | null;
          cerrado_en: string | null;
          creado_en: string;
          creado_por: string | null;
          actualizado_en: string | null;
          actualizado_por: string | null;
        };
        Insert: {
          anio: number;
          mes: number;
          fecha_inicio: string;
          fecha_fin: string;
          estado?: "abierto" | "cerrado" | "bloqueado";
        };
        Update: Partial<Database["public"]["Tables"]["periodos_contables"]["Insert"]>;
      };
      roles: {
        Row: {
          id: string;
          codigo: string;
          nombre: string;
          descripcion: string | null;
          es_sistema: boolean;
          estado: Estado;
          creado_en: string;
          creado_por: string | null;
          actualizado_en: string | null;
          actualizado_por: string | null;
        };
        Insert: {
          codigo: string;
          nombre: string;
          descripcion?: string | null;
          es_sistema?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["roles"]["Insert"]>;
      };
      permisos: {
        Row: {
          id: string;
          modulo: string;
          accion: string;
          codigo: string;
          descripcion: string | null;
        };
        Insert: {
          modulo: string;
          accion: string;
          codigo: string;
          descripcion?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["permisos"]["Insert"]>;
      };
      roles_permisos: {
        Row: { rol_id: string; permiso_id: string };
        Insert: { rol_id: string; permiso_id: string };
        Update: Partial<{ rol_id: string; permiso_id: string }>;
      };
      perfiles: {
        Row: {
          id: string;
          nombre_completo: string;
          rol_id: string | null;
          estado: Estado;
          creado_en: string;
          creado_por: string | null;
          actualizado_en: string | null;
          actualizado_por: string | null;
        };
        Insert: {
          id: string;
          nombre_completo?: string;
          rol_id?: string | null;
          estado?: Estado;
        };
        Update: Partial<Database["public"]["Tables"]["perfiles"]["Insert"]>;
      };
      usuarios_sucursales: {
        Row: { usuario_id: string; sucursal_id: string };
        Insert: { usuario_id: string; sucursal_id: string };
        Update: Partial<{ usuario_id: string; sucursal_id: string }>;
      };
      auditoria: {
        Row: {
          id: number;
          tabla: string;
          registro_id: string;
          accion: "insert" | "update" | "delete";
          usuario_id: string | null;
          datos_antes: Record<string, unknown> | null;
          datos_despues: Record<string, unknown> | null;
          ocurrido_en: string;
        };
        Insert: never;
        Update: never;
      };
    };
    Functions: {
      mis_sucursales: { Args: Record<string, never>; Returns: string[] };
      soy_administrador: { Args: Record<string, never>; Returns: boolean };
      tengo_permiso: { Args: { p_codigo: string }; Returns: boolean };
      comparte_sucursal_con: { Args: { p_usuario: string }; Returns: boolean };
      app_listar_usuarios: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          nombre_completo: string;
          email: string;
          estado: Estado;
          rol_id: string | null;
          rol_codigo: string | null;
          rol_nombre: string | null;
          sucursales: { id: string; codigo: string; nombre: string }[];
        }[];
      };
      app_obtener_usuario: {
        Args: { p_id: string };
        Returns: {
          id: string;
          nombre_completo: string;
          email: string;
          estado: Estado;
          rol_id: string | null;
          sucursales: string[];
        }[];
      };
    };
  };
}
