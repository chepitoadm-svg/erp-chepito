// =============================================================================
// Tipos del esquema public. Escritos a mano para la Fase 1 (Fundación).
// Se pueden regenerar desde el proyecto enlazado con:  npm run db:types
// =============================================================================

export type Estado = "activo" | "inactivo";

export type AsientoTipo =
  | "apertura"
  | "diario"
  | "ingreso"
  | "egreso"
  | "prorrateo"
  | "cierre"
  | "reversion";

export type AsientoEstado = "borrador" | "confirmado" | "anulado" | "descartado";

export interface AsientoLineaInput {
  cuenta_id: string;
  centro_costo_id?: string | null;
  debito?: number;
  credito?: number;
  moneda?: string;
  tipo_cambio?: number;
  monto_original?: number;
  detalle?: string | null;
}

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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
      };
      roles_permisos: {
        Row: { rol_id: string; permiso_id: string };
        Insert: { rol_id: string; permiso_id: string };
        Update: Partial<{ rol_id: string; permiso_id: string }>;
        Relationships: [];
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
        Relationships: [];
      };
      usuarios_sucursales: {
        Row: { usuario_id: string; sucursal_id: string };
        Insert: { usuario_id: string; sucursal_id: string };
        Update: Partial<{ usuario_id: string; sucursal_id: string }>;
        Relationships: [];
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
        Relationships: [];
      };
      centros_costo: {
        Row: {
          id: string;
          codigo: string;
          nombre: string;
          tipo: "final" | "intermedio";
          parent_id: string | null;
          sucursal_id: string | null;
          activo: boolean;
          requiere_prorrateo: boolean;
          creado_en: string;
          creado_por: string | null;
          actualizado_en: string | null;
          actualizado_por: string | null;
        };
        Insert: {
          codigo: string;
          nombre: string;
          tipo: "final" | "intermedio";
          parent_id?: string | null;
          sucursal_id?: string | null;
          activo?: boolean;
          requiere_prorrateo?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["centros_costo"]["Insert"]>;
        Relationships: [];
      };
      asientos: {
        Row: {
          id: string;
          tipo: AsientoTipo;
          fecha: string;
          anio: number;
          numero: number | null;
          periodo_id: string;
          glosa: string;
          estado: AsientoEstado;
          origen_tipo: string | null;
          origen_id: string | null;
          creado_en: string;
          creado_por: string | null;
          confirmado_en: string | null;
          confirmado_por: string | null;
          anulado_en: string | null;
          anulado_por: string | null;
          actualizado_en: string | null;
          actualizado_por: string | null;
        };
        Insert: {
          tipo: AsientoTipo;
          fecha: string;
          glosa: string;
          periodo_id?: string;
        };
        Update: { estado?: AsientoEstado };
        Relationships: [];
      };
      asientos_lineas: {
        Row: {
          id: string;
          asiento_id: string;
          linea: number;
          cuenta_id: string;
          centro_costo_id: string | null;
          debito: number;
          credito: number;
          moneda: string;
          tipo_cambio: number;
          monto_original: number;
          detalle: string | null;
        };
        Insert: {
          asiento_id: string;
          linea: number;
          cuenta_id: string;
          centro_costo_id?: string | null;
          debito?: number;
          credito?: number;
          moneda?: string;
          tipo_cambio?: number;
          monto_original: number;
          detalle?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["asientos_lineas"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
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
      app_listar_asientos: {
        Args: { p_estado?: string | null; p_periodo?: string | null; p_limite?: number };
        Returns: {
          id: string;
          tipo: AsientoTipo;
          numero: number | null;
          fecha: string;
          glosa: string;
          estado: AsientoEstado;
          anio: number;
          mes: number;
          total: number;
          n_lineas: number;
        }[];
      };
      app_obtener_asiento: {
        Args: { p_id: string };
        Returns: Record<string, unknown>;
      };
      app_crear_asiento: {
        Args: {
          p_tipo: string;
          p_fecha: string;
          p_glosa: string;
          p_lineas: AsientoLineaInput[];
          p_confirmar?: boolean;
        };
        Returns: string;
      };
      app_actualizar_asiento: {
        Args: {
          p_id: string;
          p_tipo: string;
          p_fecha: string;
          p_glosa: string;
          p_lineas: AsientoLineaInput[];
          p_confirmar?: boolean;
        };
        Returns: string;
      };
      fn_anular_asiento: {
        Args: { p_asiento_id: string; p_motivo: string };
        Returns: string;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
