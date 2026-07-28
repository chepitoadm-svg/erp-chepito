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

export type ArticuloTipo = "materia_prima" | "producto_terminado" | "suministro";

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
      // === Fase 3 — Inventario + Compras ===================================
      unidades: {
        Row: {
          id: string;
          codigo: string;
          nombre: string;
          activa: boolean;
          creado_en: string;
          creado_por: string | null;
          actualizado_en: string | null;
          actualizado_por: string | null;
        };
        Insert: { codigo: string; nombre: string; activa?: boolean };
        Update: Partial<Database["public"]["Tables"]["unidades"]["Insert"]>;
        Relationships: [];
      };
      iva_tarifas: {
        Row: {
          id: string;
          codigo: string;
          nombre: string;
          porcentaje: number;
          codigo_hacienda: string | null;
          activa: boolean;
          creado_en: string;
          creado_por: string | null;
          actualizado_en: string | null;
          actualizado_por: string | null;
        };
        Insert: {
          codigo: string;
          nombre: string;
          porcentaje: number;
          codigo_hacienda?: string | null;
          activa?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["iva_tarifas"]["Insert"]>;
        Relationships: [];
      };
      articulos: {
        Row: {
          id: string;
          codigo: string;
          nombre: string;
          tipo: ArticuloTipo;
          unidad_stock_id: string;
          iva_tarifa_id: string;
          cabys_codigo: string | null;
          cuenta_inventario_id: string | null;
          inventariable: boolean;
          estado: Estado;
          creado_en: string;
          creado_por: string | null;
          actualizado_en: string | null;
          actualizado_por: string | null;
        };
        Insert: {
          codigo: string;
          nombre: string;
          tipo?: ArticuloTipo;
          unidad_stock_id: string;
          iva_tarifa_id: string;
          cabys_codigo?: string | null;
          cuenta_inventario_id?: string | null;
          inventariable?: boolean;
          estado?: Estado;
        };
        Update: Partial<Database["public"]["Tables"]["articulos"]["Insert"]>;
        Relationships: [];
      };
      articulos_saldos: {
        Row: {
          articulo_id: string;
          existencia_total: number;
          valor_total: number;
          costo_promedio: number;
          actualizado_en: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      existencias: {
        Row: { articulo_id: string; bodega_id: string; cantidad: number };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      proveedores: {
        Row: {
          id: string;
          cedula_juridica: string;
          nombre: string;
          condicion_venta_default: string | null;
          plazo_credito_default: number | null;
          cuenta_cxp_id: string | null;
          estado: Estado;
          creado_en: string;
          creado_por: string | null;
          actualizado_en: string | null;
          actualizado_por: string | null;
        };
        Insert: {
          cedula_juridica: string;
          nombre: string;
          condicion_venta_default?: string | null;
          plazo_credito_default?: number | null;
          cuenta_cxp_id?: string | null;
          estado?: Estado;
        };
        Update: Partial<Database["public"]["Tables"]["proveedores"]["Insert"]>;
        Relationships: [];
      };
      proveedor_articulos: {
        Row: {
          id: string;
          proveedor_id: string;
          codigo_comercial: string;
          articulo_id: string;
          unidad_compra_id: string;
          factor_a_stock: number;
          descripcion_proveedor: string | null;
          creado_en: string;
          creado_por: string | null;
          actualizado_en: string | null;
          actualizado_por: string | null;
        };
        Insert: {
          proveedor_id: string;
          codigo_comercial: string;
          articulo_id: string;
          unidad_compra_id: string;
          factor_a_stock?: number;
          descripcion_proveedor?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["proveedor_articulos"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      v_existencias_valoradas: {
        Row: {
          articulo_id: string;
          articulo_codigo: string;
          articulo_nombre: string;
          bodega_id: string;
          bodega_codigo: string;
          bodega_nombre: string;
          sucursal_id: string;
          cantidad: number;
          costo_promedio: number;
          valor: number;
        };
        Relationships: [];
      };
      v_kardex: {
        Row: {
          id: string;
          articulo_id: string;
          articulo_codigo: string;
          articulo_nombre: string;
          bodega_id: string;
          bodega_codigo: string;
          sucursal_id: string;
          fecha: string;
          tipo: string;
          cantidad: number;
          costo_unitario: number;
          costo_total: number;
          existencia_despues: number;
          promedio_despues: number;
          origen_tipo: string | null;
          origen_id: string | null;
          detalle: string | null;
          creado_en: string;
        };
        Relationships: [];
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
      fn_balanza: {
        Args: { p_hasta: string; p_incluir_prorrateo?: boolean };
        Returns: {
          codigo: string;
          nombre: string;
          nivel: number;
          tipo: string;
          naturaleza: "deudora" | "acreedora";
          acepta_movimiento: boolean;
          debitos: number;
          creditos: number;
          saldo: number;
        }[];
      };
      fn_balance_situacion: {
        Args: { p_fecha: string };
        Returns: {
          seccion: string;
          subtipo: string;
          codigo: string;
          nombre: string;
          nivel: number;
          saldo: number;
        }[];
      };
      fn_estado_resultados: {
        Args: { p_desde: string; p_hasta: string; p_incluir_prorrateo?: boolean };
        Returns: {
          centro_codigo: string;
          centro_nombre: string;
          centro_tipo: string;
          seccion: string;
          subtipo: string;
          cuenta_codigo: string;
          cuenta_nombre: string;
          monto: number;
        }[];
      };
      app_mayor_cuenta: {
        Args: { p_cuenta_id: string; p_desde?: string | null; p_hasta?: string | null };
        Returns: {
          fecha: string;
          asiento_id: string;
          asiento_tipo: AsientoTipo;
          asiento_numero: number | null;
          glosa: string;
          centro_codigo: string | null;
          debito: number;
          credito: number;
          saldo: number;
        }[];
      };
      app_listar_periodos: {
        Args: { p_anio?: number | null };
        Returns: {
          id: string;
          anio: number;
          mes: number;
          fecha_inicio: string;
          fecha_fin: string;
          estado: "abierto" | "cerrado" | "bloqueado";
          n_borradores: number;
          pools_sin_bases: string | null;
        }[];
      };
      app_estado_prorrateo: {
        Args: { p_periodo: string };
        Returns: {
          centro_id: string;
          codigo: string;
          nombre: string;
          requiere_prorrateo: boolean;
          pool: number;
          suma_bases: number;
          bases: { centro_destino_id: string; destino_codigo: string; porcentaje: number }[];
        }[];
      };
      app_guardar_bases_prorrateo: {
        Args: { p_periodo: string; p_origen: string; p_bases: unknown };
        Returns: undefined;
      };
      fn_cerrar_periodo: { Args: { p_periodo_id: string }; Returns: undefined };
      fn_reabrir_periodo: { Args: { p_periodo_id: string }; Returns: undefined };
      fn_generar_prorrateo: {
        Args: { p_periodo_id: string; p_centro_origen_id: string };
        Returns: string;
      };
      fn_bodegas_visibles: { Args: Record<string, never>; Returns: string[] };
      fn_libro_inventarios: {
        Args: { p_fecha: string };
        Returns: {
          articulo_codigo: string;
          articulo_nombre: string;
          bodega_codigo: string;
          cantidad: number;
          costo_promedio: number;
          valor: number;
        }[];
      };
      fn_conciliar_inventario_inicial: {
        Args: Record<string, never>;
        Returns: {
          valor_kardex_inicial: number;
          valor_apertura_contable: number;
          diferencia: number;
        }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
