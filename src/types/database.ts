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
      ajustes_inventario: {
        Row: {
          id: string;
          fecha: string;
          bodega_id: string;
          motivo: string;
          estado: "borrador" | "confirmado" | "anulado";
          asiento_id: string | null;
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
          fecha?: string;
          bodega_id: string;
          motivo: string;
          estado?: "borrador" | "confirmado" | "anulado";
        };
        Update: Partial<Database["public"]["Tables"]["ajustes_inventario"]["Insert"]>;
        Relationships: [];
      };
      ajustes_inventario_lineas: {
        Row: {
          id: string;
          ajuste_id: string;
          linea: number;
          articulo_id: string;
          direccion: "pos" | "neg";
          cantidad: number;
          detalle: string | null;
        };
        Insert: {
          ajuste_id: string;
          linea: number;
          articulo_id: string;
          direccion: "pos" | "neg";
          cantidad: number;
          detalle?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["ajustes_inventario_lineas"]["Insert"]>;
        Relationships: [];
      };
      cierres_inventario: {
        Row: {
          id: string;
          fecha: string;
          bodega_id: string;
          centro_costo_id: string | null;
          estado: "borrador" | "confirmado" | "anulado";
          valor_teorico: number;
          valor_fisico: number;
          diferencia: number;
          asiento_id: string | null;
          creado_en: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      cierres_inventario_lineas: {
        Row: {
          id: string;
          cierre_id: string;
          linea: number;
          articulo_id: string;
          cantidad_teorica: number;
          cantidad_fisica: number;
          costo_promedio: number;
          valor_teorico: number;
          valor_fisico: number;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      desechos_pt: {
        Row: {
          id: string;
          fecha: string;
          centro_costo_id: string;
          motivo: "danado" | "vencido" | "otro";
          glosa: string | null;
          estado: "borrador" | "confirmado" | "anulado";
          valor_total: number;
          asiento_id: string | null;
          creado_en: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      desechos_pt_lineas: {
        Row: {
          id: string;
          desecho_id: string;
          linea: number;
          descripcion: string;
          cantidad: number;
          costo_unitario: number;
          valor: number;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      transferencias: {
        Row: {
          id: string;
          fecha: string;
          bodega_origen_id: string;
          bodega_destino_id: string;
          glosa: string | null;
          estado: "borrador" | "en_transito" | "recibida" | "anulada";
          enviada_en: string | null;
          enviada_por: string | null;
          recibida_en: string | null;
          recibida_por: string | null;
          anulada_en: string | null;
          anulada_por: string | null;
          creado_en: string;
          creado_por: string | null;
          actualizado_en: string | null;
          actualizado_por: string | null;
        };
        Insert: {
          fecha?: string;
          bodega_origen_id: string;
          bodega_destino_id: string;
          glosa?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["transferencias"]["Insert"]>;
        Relationships: [];
      };
      transferencias_lineas: {
        Row: {
          id: string;
          transferencia_id: string;
          linea: number;
          articulo_id: string;
          cantidad_enviada: number;
          cantidad_recibida: number;
          detalle: string | null;
        };
        Insert: {
          transferencia_id: string;
          linea: number;
          articulo_id: string;
          cantidad_enviada: number;
          detalle?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["transferencias_lineas"]["Insert"]>;
        Relationships: [];
      };
      facturas_compra: {
        Row: {
          id: string;
          proveedor_id: string;
          recepcion_id: string | null;
          bodega_id: string | null;
          clave: string | null;
          consecutivo: string | null;
          fecha_emision: string;
          condicion_venta: string | null;
          plazo_credito: number | null;
          fecha_vencimiento: string | null;
          moneda: string;
          tipo_cambio: number;
          subtotal: number;
          iva_total: number;
          total: number;
          estado: "borrador" | "confirmada" | "anulada";
          asiento_id: string | null;
          creado_en: string;
          creado_por: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      facturas_compra_lineas: {
        Row: {
          id: string;
          factura_id: string;
          linea: number;
          codigo_comercial: string | null;
          articulo_id: string;
          cantidad: number;
          costo_unitario: number;
          base_imponible: number;
          iva_tarifa_id: string | null;
          iva_monto: number;
          detalle: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      cuentas_por_pagar: {
        Row: {
          id: string;
          proveedor_id: string;
          factura_id: string | null;
          fecha: string;
          fecha_vencimiento: string | null;
          monto_original: number;
          saldo: number;
          estado: string;
          creado_en: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      recepciones: {
        Row: {
          id: string;
          proveedor_id: string;
          bodega_id: string;
          orden_compra_id: string | null;
          fecha: string;
          glosa: string | null;
          estado: "borrador" | "confirmada" | "anulada";
          asiento_id: string | null;
          facturada: boolean;
          creado_en: string;
          creado_por: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      recepciones_lineas: {
        Row: {
          id: string;
          recepcion_id: string;
          linea: number;
          articulo_id: string;
          cantidad: number;
          costo_unitario: number;
          detalle: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      devoluciones_compra: {
        Row: {
          id: string;
          proveedor_id: string;
          factura_id: string | null;
          bodega_id: string;
          fecha: string;
          motivo: string;
          subtotal: number;
          iva_total: number;
          total: number;
          estado: "borrador" | "confirmada" | "anulada";
          asiento_id: string | null;
          creado_en: string;
          creado_por: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      devoluciones_compra_lineas: {
        Row: {
          id: string;
          devolucion_id: string;
          linea: number;
          articulo_id: string;
          cantidad: number;
          base_imponible: number;
          iva_monto: number;
          detalle: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      pagos_proveedor: {
        Row: {
          id: string;
          proveedor_id: string;
          fecha: string;
          medio_pago: "efectivo" | "transferencia" | "cheque" | "otro";
          cuenta_pago_id: string;
          referencia: string | null;
          glosa: string | null;
          monto_total: number;
          estado: "borrador" | "confirmado" | "anulado";
          asiento_id: string | null;
          creado_en: string;
          creado_por: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      pagos_proveedor_lineas: {
        Row: { id: string; pago_id: string; linea: number; cxp_id: string; monto: number };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      correo_fuentes: {
        Row: {
          id: string;
          remitente: string;
          etiqueta: string;
          proveedor_id: string | null;
          activo: boolean;
          desde: string;
          ultimo_jalado: string | null;
          creado_en: string;
          creado_por: string | null;
          actualizado_en: string | null;
          actualizado_por: string | null;
        };
        Insert: {
          remitente: string;
          etiqueta: string;
          proveedor_id?: string | null;
          activo?: boolean;
          desde?: string;
        };
        Update: {
          remitente?: string;
          etiqueta?: string;
          activo?: boolean;
          desde?: string;
          ultimo_jalado?: string | null;
        };
        Relationships: [];
      };
      comprobantes_ingesta: {
        Row: {
          id: string;
          clave: string | null;
          tipo_documento: string | null;
          estado: "recibido" | "validado" | "requiere_mapeo" | "procesado" | "error" | "descartado";
          emisor_cedula: string | null;
          emisor_nombre: string | null;
          receptor_cedula: string | null;
          consecutivo: string | null;
          fecha_emision: string | null;
          condicion_venta: string | null;
          plazo_credito: number | null;
          fecha_vencimiento: string | null;
          moneda: string | null;
          tipo_cambio: number | null;
          subtotal: number | null;
          iva_total: number | null;
          total: number | null;
          estado_hacienda: string | null;
          proveedor_id: string | null;
          factura_id: string | null;
          error_detalle: string | null;
          lineas: unknown;
          xml_comprobante: string;
          xml_respuesta: string | null;
          creado_en: string;
          creado_por: string | null;
          actualizado_en: string | null;
          actualizado_por: string | null;
        };
        Insert: {
          clave?: string | null;
          tipo_documento?: string | null;
          estado?: string;
          emisor_cedula?: string | null;
          emisor_nombre?: string | null;
          receptor_cedula?: string | null;
          consecutivo?: string | null;
          fecha_emision?: string | null;
          condicion_venta?: string | null;
          plazo_credito?: number | null;
          fecha_vencimiento?: string | null;
          moneda?: string | null;
          tipo_cambio?: number | null;
          subtotal?: number | null;
          iva_total?: number | null;
          total?: number | null;
          estado_hacienda?: string | null;
          proveedor_id?: string | null;
          factura_id?: string | null;
          error_detalle?: string | null;
          lineas?: unknown;
          xml_comprobante: string;
          xml_respuesta?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["comprobantes_ingesta"]["Insert"]>;
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
      v_inventario_transito: {
        Row: {
          transferencia_id: string;
          fecha: string;
          origen: string;
          destino: string;
          articulo_codigo: string;
          articulo_nombre: string;
          cantidad_enviada: number;
          cantidad_recibida: number;
          en_transito: number;
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
      fn_cargar_saldo_inicial: {
        Args: {
          p_articulo: string;
          p_bodega: string;
          p_cantidad: number;
          p_costo_unitario: number;
          p_fecha?: string | null;
        };
        Returns: string;
      };
      fn_crear_ajuste: {
        Args: { p_bodega: string; p_fecha: string; p_motivo: string; p_lineas: unknown };
        Returns: string;
      };
      fn_confirmar_ajuste: { Args: { p_ajuste: string }; Returns: string };
      fn_anular_ajuste: { Args: { p_ajuste: string; p_motivo: string }; Returns: undefined };
      fn_crear_cierre: {
        Args: { p_bodega: string; p_fecha: string; p_lineas: unknown };
        Returns: string;
      };
      fn_confirmar_cierre: { Args: { p_cierre: string }; Returns: string };
      fn_anular_cierre: { Args: { p_cierre: string; p_motivo: string }; Returns: undefined };
      fn_crear_desecho: {
        Args: {
          p_centro: string;
          p_fecha: string;
          p_motivo: string;
          p_glosa: string | null;
          p_lineas: unknown;
        };
        Returns: string;
      };
      fn_confirmar_desecho: { Args: { p_desecho: string }; Returns: string };
      fn_anular_desecho: { Args: { p_desecho: string; p_motivo: string }; Returns: undefined };
      fn_crear_transferencia: {
        Args: { p_origen: string; p_destino: string; p_glosa: string | null; p_lineas: unknown };
        Returns: string;
      };
      fn_enviar_transferencia: { Args: { p_transf: string }; Returns: undefined };
      fn_recibir_transferencia: {
        Args: { p_transf: string; p_recibidas?: unknown };
        Returns: undefined;
      };
      fn_anular_transferencia: {
        Args: { p_transf: string; p_motivo: string };
        Returns: undefined;
      };
      fn_crear_factura: {
        Args: {
          p_proveedor: string;
          p_bodega: string;
          p_centro: string;
          p_clave: string | null;
          p_fecha_emision: string;
          p_condicion: string | null;
          p_plazo: number | null;
          p_lineas: unknown;
        };
        Returns: string;
      };
      fn_confirmar_factura: { Args: { p_factura: string }; Returns: string };
      fn_anular_factura: { Args: { p_factura: string; p_motivo: string }; Returns: undefined };
      fn_crear_factura_gasto: {
        Args: {
          p_proveedor: string;
          p_clave: string | null;
          p_fecha: string;
          p_condicion: string | null;
          p_plazo: number | null;
          p_cuenta_gasto: string;
          p_centro: string;
          p_subtotal: number;
          p_iva_total: number;
          p_glosa: string | null;
        };
        Returns: string;
      };
      fn_crear_factura_xml: {
        Args: {
          p_proveedor: string;
          p_bodega: string;
          p_centro: string;
          p_clave: string | null;
          p_fecha_emision: string;
          p_condicion: string | null;
          p_plazo: number | null;
          p_lineas: unknown;
        };
        Returns: string;
      };
      fn_crear_recepcion: {
        Args: { p_proveedor: string; p_bodega: string; p_glosa: string | null; p_lineas: unknown };
        Returns: string;
      };
      fn_crear_factura_recepcion: {
        Args: {
          p_recepcion: string;
          p_clave: string | null;
          p_fecha_emision: string;
          p_condicion: string | null;
          p_plazo: number | null;
          p_lineas: unknown;
        };
        Returns: string;
      };
      fn_confirmar_recepcion: { Args: { p_recep: string }; Returns: string };
      fn_anular_recepcion: { Args: { p_recep: string; p_motivo: string }; Returns: undefined };
      fn_crear_devolucion: {
        Args: { p_factura: string; p_bodega: string; p_motivo: string; p_lineas: unknown };
        Returns: string;
      };
      fn_confirmar_devolucion: { Args: { p_dev: string }; Returns: string };
      fn_anular_devolucion: { Args: { p_dev: string; p_motivo: string }; Returns: undefined };
      fn_crear_pago: {
        Args: {
          p_proveedor: string;
          p_fecha: string;
          p_medio: string;
          p_cuenta_pago: string;
          p_referencia: string | null;
          p_glosa: string | null;
          p_lineas: unknown;
        };
        Returns: string;
      };
      fn_confirmar_pago: { Args: { p_pago: string }; Returns: string };
      fn_anular_pago: { Args: { p_pago: string; p_motivo: string }; Returns: undefined };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
