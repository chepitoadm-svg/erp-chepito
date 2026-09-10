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
        Insert: {
          tabla: string;
          registro_id: string;
          accion: string;
          usuario_id?: string | null;
          datos_antes?: Record<string, unknown> | null;
          datos_despues?: Record<string, unknown> | null;
        };
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
      proveedor_alias_banco: {
        Row: {
          id: string;
          proveedor_id: string;
          alias: string;
          creado_en: string;
          creado_por: string | null;
          actualizado_en: string | null;
          actualizado_por: string | null;
        };
        Insert: {
          proveedor_id: string;
          alias: string;
        };
        Update: Partial<Database["public"]["Tables"]["proveedor_alias_banco"]["Insert"]>;
        Relationships: [];
      };
      usuarios_permisos: {
        Row: {
          usuario_id: string;
          permiso_id: string;
          efecto: string;
          creado_en: string;
          creado_por: string | null;
        };
        Insert: { usuario_id: string; permiso_id: string; efecto: string };
        Update: Partial<Database["public"]["Tables"]["usuarios_permisos"]["Insert"]>;
        Relationships: [];
      };
      retiro_caja: {
        Row: {
          id: string;
          centro_id: string;
          anio: number;
          mes: number;
          fecha: string;
          control_caja: string | null;
          monto: number;
          motivo: string | null;
          cajero: string | null;
          caja: string | null;
          huella: string;
          estado: "pendiente" | "ingresado" | "na";
          gasto_id: string | null;
          nota: string | null;
          creado_en: string;
          creado_por: string | null;
          actualizado_en: string | null;
          actualizado_por: string | null;
        };
        Insert: {
          centro_id: string;
          anio: number;
          mes: number;
          fecha: string;
          monto: number;
          huella: string;
          control_caja?: string | null;
          motivo?: string | null;
          cajero?: string | null;
          caja?: string | null;
          estado?: string;
          gasto_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["retiro_caja"]["Insert"]>;
        Relationships: [];
      };
      panaderia_dato: {
        Row: {
          id: string;
          centro_costo_id: string;
          etiqueta: string;
          valor: string | null;
          nota: string | null;
          creado_en: string;
          creado_por: string | null;
          actualizado_en: string | null;
          actualizado_por: string | null;
        };
        Insert: { centro_costo_id: string; etiqueta: string; valor?: string | null; nota?: string | null };
        Update: Partial<Database["public"]["Tables"]["panaderia_dato"]["Insert"]>;
        Relationships: [];
      };
      costo_producto_vinculo: {
        Row: {
          id: string;
          codigo: string;
          producto_id: string;
          producto_nombre: string | null;
          creado_en: string;
          creado_por: string | null;
          actualizado_en: string | null;
          actualizado_por: string | null;
        };
        Insert: { codigo: string; producto_id: string; producto_nombre?: string | null };
        Update: Partial<Database["public"]["Tables"]["costo_producto_vinculo"]["Insert"]>;
        Relationships: [];
      };
      desecho_mes: {
        Row: {
          id: string;
          centro_costo_id: string;
          periodo: string;
          bodega: string | null;
          compras_total: number;
          merma: number;
          autoconsumo: number;
          costo_vendido: number;
          reclasif_id: string | null;
          posteado: boolean;
          creado_en: string;
          creado_por: string | null;
          actualizado_en: string | null;
          actualizado_por: string | null;
        };
        Insert: {
          centro_costo_id: string;
          periodo: string;
          bodega?: string | null;
          compras_total?: number;
          merma?: number;
          autoconsumo?: number;
          costo_vendido?: number;
          reclasif_id?: string | null;
          posteado?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["desecho_mes"]["Insert"]>;
        Relationships: [];
      };
      desecho_detalle: {
        Row: {
          id: string;
          desecho_mes_id: string;
          codigo: string;
          nombre: string | null;
          tipo_mov: string | null;
          clase: "merma" | "autoconsumo" | "ignorar";
          cantidad: number;
          costo_unitario: number | null;
          costo_total: number | null;
          creado_en: string;
        };
        Insert: {
          desecho_mes_id: string;
          codigo: string;
          nombre?: string | null;
          tipo_mov?: string | null;
          clase?: "merma" | "autoconsumo" | "ignorar";
          cantidad?: number;
          costo_unitario?: number | null;
          costo_total?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["desecho_detalle"]["Insert"]>;
        Relationships: [];
      };
      colaborador_destino: {
        Row: {
          clave: string;
          cedula: string | null;
          nombre: string | null;
          destino: "TAL" | "CH1" | "CH2" | "DIV" | "CAS";
          creado_en: string;
          actualizado_en: string | null;
          actualizado_por: string | null;
        };
        Insert: { clave: string; cedula?: string | null; nombre?: string | null; destino: "TAL" | "CH1" | "CH2" | "DIV" | "CAS" };
        Update: Partial<Database["public"]["Tables"]["colaborador_destino"]["Insert"]>;
        Relationships: [];
      };
      planilla: {
        Row: {
          id: string;
          titulo: string | null;
          fecha: string;
          quincena: number | null;
          reparto_ch1: number;
          estado: "borrador" | "confirmada" | "anulada" | "descartada";
          asiento_id: string | null;
          pago_asiento_id: string | null;
          pago_fecha: string | null;
          pago_cuenta_id: string | null;
          creado_en: string;
          creado_por: string | null;
          confirmado_en: string | null;
          confirmado_por: string | null;
          anulado_en: string | null;
          anulado_por: string | null;
          actualizado_en: string | null;
          actualizado_por: string | null;
          adelanto_asiento_id: string | null;
        };
        Insert: {
          titulo?: string | null;
          fecha: string;
          quincena?: number | null;
          reparto_ch1?: number;
          estado?: "borrador" | "confirmada" | "anulada";
        };
        Update: Partial<Database["public"]["Tables"]["planilla"]["Insert"]>;
        Relationships: [];
      };
      planilla_lineas: {
        Row: {
          id: string;
          planilla_id: string;
          clave: string | null;
          cedula: string | null;
          nombre: string | null;
          puesto: string | null;
          tiene_ccss: boolean;
          destino: "TAL" | "CH1" | "CH2" | "DIV" | "CAS";
          salario_base: number;
          ccss_obrero: number;
          cargas_patronal: number;
          pago_adicional: number;
          adelanto: number;
          rebajos: number;
          embargo: number;
          creado_en: string;
        };
        Insert: {
          planilla_id: string;
          clave?: string | null;
          cedula?: string | null;
          nombre?: string | null;
          puesto?: string | null;
          tiene_ccss?: boolean;
          destino?: "TAL" | "CH1" | "CH2" | "DIV" | "CAS";
          salario_base?: number;
          ccss_obrero?: number;
          cargas_patronal?: number;
          pago_adicional?: number;
          adelanto?: number;
          rebajos?: number;
          embargo?: number;
        };
        Update: Partial<Database["public"]["Tables"]["planilla_lineas"]["Insert"]>;
        Relationships: [];
      };
      planilla_pagos: {
        Row: {
          id: string;
          planilla_id: string;
          fecha: string;
          cuenta_id: string;
          monto: number;
          asiento_id: string | null;
          estado: "confirmado" | "anulado";
          creado_en: string;
          creado_por: string | null;
          anulado_en: string | null;
          anulado_por: string | null;
        };
        Insert: { planilla_id: string; fecha: string; cuenta_id: string; monto: number };
        Update: Partial<Database["public"]["Tables"]["planilla_pagos"]["Insert"]>;
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
      costo_produccion_mes: {
        Row: {
          id: string;
          periodo: string;
          estado: "borrador" | "confirmado" | "anulado";
          total: number;
          consumo_teorico: number;
          asiento_id: string | null;
          creado_en: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      costo_produccion_mes_lineas: {
        Row: {
          id: string;
          mes_id: string;
          centro_costo_id: string;
          monto: number;
          consumo_teorico: number;
          unidades_sin_receta: number;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      gastos: {
        Row: {
          id: string;
          fecha: string;
          centro_costo_id: string;
          cuenta_gasto_id: string;
          cuenta_pago_id: string;
          descripcion: string | null;
          subtotal: number;
          iva: number;
          total: number;
          estado: "borrador" | "confirmado" | "anulado";
          asiento_id: string | null;
          proveedor_id: string | null;
          fecha_vencimiento: string | null;
          creado_en: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      conciliaciones_banco: {
        Row: {
          id: string;
          cuenta_id: string;
          fecha_corte: string;
          saldo_inicial: number;
          saldo_final: number;
          estado: "borrador" | "conciliada" | "anulada";
          creado_en: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      estado_cuenta_lineas: {
        Row: {
          id: string;
          conciliacion_id: string;
          orden: number;
          fecha: string;
          referencia: string | null;
          codigo: string | null;
          descripcion: string | null;
          debito: number;
          credito: number;
          balance: number | null;
          asiento_linea_id: string | null;
          estado: "pendiente" | "conciliada";
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      conciliacion_lineas_extra: {
        Row: {
          linea_banco_id: string;
          asiento_linea_id: string;
          creado_en: string;
          creado_por: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      ventas_dia: {
        Row: {
          id: string;
          fecha: string;
          centro_costo_id: string;
          gravado: number;
          exento: number;
          iva: number;
          total: number;
          efectivo: number;
          tarjeta: number;
          sinpe: number;
          estado: "borrador" | "confirmado" | "anulado";
          asiento_id: string | null;
          glosa: string | null;
          creado_en: string;
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
          tipo: "inventario" | "gasto";
          cuenta_gasto_id: string | null;
          centro_costo_id: string | null;
          glosa: string | null;
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
          tipo: "factura" | "credito";
          devolucion_id: string | null;
          nota_credito_id: string | null;
          creado_en: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      notas_credito_compra: {
        Row: {
          id: string;
          proveedor_id: string;
          fecha: string;
          cuenta_id: string;
          centro_costo_id: string | null;
          referencia: string | null;
          subtotal: number;
          iva: number;
          total: number;
          glosa: string | null;
          estado: "confirmada" | "anulada";
          asiento_id: string | null;
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
          cedula_emisor: string | null;
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
          cedula_emisor?: string | null;
        };
        Update: {
          remitente?: string;
          etiqueta?: string;
          activo?: boolean;
          desde?: string;
          cedula_emisor?: string | null;
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
      fn_registrar_liquidacion_datafono: {
        Args: {
          p_centro: string;
          p_periodo: string;
          p_comision: number;
          p_servicios: number;
          p_ret_iva: number;
          p_ret_renta: number;
          p_neto_banco: number;
          p_pos_tarjeta: number;
          p_facturacion: number;
        };
        Returns: string;
      };
      fn_anular_liquidacion_datafono: { Args: { p_liq: string; p_motivo: string }; Returns: undefined };
      fn_cuadre_gastos: {
        Args: { p_desde: string; p_hasta: string };
        Returns: {
          cuenta_codigo: string;
          cuenta_nombre: string;
          cuenta_id: string;
          auxiliar: number;
          mayor: number;
          diferencia: number;
        }[];
      };
      fn_flujo_detalle: {
        Args: { p_cuenta: string; p_desde: string; p_hasta: string };
        Returns: {
          fecha: string;
          referencia: string | null;
          descripcion: string | null;
          monto: number;
          proveedor_nombre: string | null;
          origen_tipo: string | null;
          centro_codigo: string | null;
          asiento_id: string;
          origen_id: string | null;
        }[];
      };
      fn_postear_reclasificacion_costo: {
        Args: { p_centro: string; p_periodo: string; p_merma: number; p_autoconsumo: number };
        Returns: string;
      };
      fn_anular_reclasificacion_costo: { Args: { p_id: string; p_motivo: string }; Returns: undefined };
      fn_guardar_desecho: {
        Args: {
          p_centro: string;
          p_periodo: string;
          p_bodega: string | null;
          p_compras: number;
          p_merma: number;
          p_auto: number;
          p_vendido: number;
          p_lineas: unknown;
        };
        Returns: string;
      };
      fn_guardar_planilla: {
        Args: {
          p_id: string | null;
          p_titulo: string | null;
          p_fecha: string;
          p_quincena: number | null;
          p_reparto_ch1: number;
          p_lineas: unknown;
        };
        Returns: string;
      };
      fn_postear_planilla: { Args: { p_planilla: string }; Returns: string };
      fn_pagar_planilla: { Args: { p_planilla: string; p_cuenta: string; p_fecha: string; p_monto: number }; Returns: string };
      fn_anular_pago_planilla: { Args: { p_pago: string; p_motivo: string }; Returns: undefined };
      fn_planilla_neto: { Args: { p_planilla: string }; Returns: number };
      fn_anular_planilla: { Args: { p_planilla: string; p_motivo: string }; Returns: undefined };
      fn_descartar_planilla: { Args: { p_id: string }; Returns: undefined };
      fn_guardar_panaderia_dato: {
        Args: { p_id: string | null; p_centro: string; p_etiqueta: string; p_valor: string | null; p_nota: string | null };
        Returns: string;
      };
      fn_borrar_panaderia_dato: { Args: { p_id: string }; Returns: undefined };
      fn_pagar_gasto: { Args: { p_gasto: string; p_cuenta: string; p_fecha: string; p_monto: number }; Returns: string };
      fn_anular_pago_gasto: { Args: { p_pago: string; p_motivo: string }; Returns: undefined };
      fn_crear_rol: { Args: { p_nombre: string; p_descripcion: string | null; p_permisos: string[] }; Returns: string };
      fn_editar_rol: { Args: { p_rol: string; p_nombre: string; p_descripcion: string | null; p_permisos: string[] }; Returns: undefined };
      fn_cambiar_estado_rol: { Args: { p_rol: string; p_estado: string }; Returns: undefined };
      fn_set_permisos_usuario: { Args: { p_usuario: string; p_conceder: string[]; p_revocar: string[] }; Returns: undefined };
      fn_latido_sesion: { Args: Record<string, never>; Returns: undefined };
      app_reporte_sesiones: {
        Args: { p_usuario?: string | null; p_desde?: string | null; p_hasta?: string | null; p_limit?: number };
        Returns: {
          id: string;
          usuario_id: string;
          usuario_nombre: string | null;
          dia: string;
          dia_txt: string;
          hora_inicio: string;
          hora_fin: string;
          duracion_min: number;
          activa: boolean;
          inicio: string;
        }[];
      };
      app_sesiones_usuarios: { Args: Record<string, never>; Returns: { usuario_id: string; nombre_completo: string }[] };
      fn_generar_cierre: { Args: { p_anio: number; p_mes: number }; Returns: string };
      fn_marcar_item: { Args: { p_item: string; p_estado: string; p_nota?: string | null }; Returns: undefined };
      fn_registrar_archivo_cierre: {
        Args: { p_item: string; p_path: string; p_nombre: string; p_tamano: number | null; p_mime: string | null };
        Returns: string;
      };
      fn_anular_archivo_cierre: { Args: { p_archivo: string }; Returns: undefined };
      fn_cerrar_mes: { Args: { p_cierre: string; p_cerrar: boolean }; Returns: undefined };
      fn_guardar_requisito: {
        Args: {
          p_id: string | null;
          p_nombre: string;
          p_grupo: string;
          p_alcance: string;
          p_auto: string;
          p_centros: string[] | null;
          p_requiere_archivo: boolean;
          p_orden: number;
        };
        Returns: string;
      };
      fn_desactivar_requisito: { Args: { p_id: string; p_activo: boolean }; Returns: undefined };
      app_listar_cierres: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          anio: number;
          mes: number;
          estado: "en_proceso" | "cerrado";
          total: number;
          listos: number;
          pendientes: number;
        }[];
      };
      app_cierre_detalle: {
        Args: { p_anio: number; p_mes: number };
        Returns: {
          item_id: string;
          requisito_id: string;
          codigo: string;
          nombre: string;
          grupo: string;
          orden: number;
          alcance: "global" | "centro" | "cuenta_banco";
          auto_fuente: "ventas" | "compras" | "planilla" | "conciliacion" | "retiros_caja" | "retiros_dep" | "salidas_vext" | null;
          requiere_archivo: boolean;
          centro_id: string | null;
          centro_codigo: string | null;
          cuenta_id: string | null;
          cuenta_codigo: string | null;
          cuenta_nombre: string | null;
          estado_manual: "pendiente" | "listo" | "na";
          nota: string | null;
          auto_listo: boolean | null;
          auto_n: number | null;
          auto_monto: number | null;
          auto_detalle: string | null;
          estado_efectivo: "pendiente" | "listo" | "na";
          n_archivos: number;
        }[];
      };
      app_archivos_item: {
        Args: { p_item: string };
        Returns: { id: string; nombre: string; tamano: number | null; mime: string | null; path: string; subido_en: string }[];
      };
      app_archivo_path: { Args: { p_archivo: string }; Returns: string };
      fn_importar_retiros: {
        Args: { p_centro: string; p_anio: number; p_mes: number; p_filas: unknown };
        Returns: { insertados: number; duplicados: number }[];
      };
      fn_marcar_retiro: { Args: { p_retiro: string; p_estado: string }; Returns: undefined };
      fn_importar_retiros_dep: {
        Args: { p_anio: number; p_mes: number; p_filas: unknown };
        Returns: { insertados: number; duplicados: number }[];
      };
      app_listar_retiros_dep: {
        Args: { p_anio: number; p_mes: number };
        Returns: {
          id: string;
          fecha: string;
          control_caja: string | null;
          monto: number;
          motivo: string | null;
          cajero: string | null;
          caja: string | null;
          estado: "pendiente" | "ingresado" | "na";
          mov_tipo: "gasto" | "pago" | null;
          mov_desc: string | null;
          asiento_id: string | null;
          asiento_numero: number | null;
          sug_gasto_id: string | null;
          sug_fecha: string | null;
          sug_desc: string | null;
          sug_dif_dias: number | null;
        }[];
      };
      fn_enlazar_retiro: { Args: { p_retiro: string; p_gasto: string }; Returns: undefined };
      app_listar_retiros: {
        Args: { p_centro: string; p_anio: number; p_mes: number };
        Returns: {
          id: string;
          fecha: string;
          control_caja: string | null;
          monto: number;
          motivo: string | null;
          cajero: string | null;
          caja: string | null;
          estado: "pendiente" | "ingresado" | "na";
          mov_tipo: "gasto" | "pago" | null;
          mov_desc: string | null;
          asiento_id: string | null;
          asiento_numero: number | null;
          sug_gasto_id: string | null;
          sug_fecha: string | null;
          sug_desc: string | null;
          sug_dif_dias: number | null;
        }[];
      };
      app_cxp_pendientes: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          proveedor_id: string;
          proveedor_nombre: string;
          fecha: string;
          vence: string | null;
          consecutivo: string | null;
          saldo: number;
        }[];
      };
      fn_enlazar_pago_retiro: { Args: { p_retiro: string; p_pago: string }; Returns: undefined };
      fn_enlazar_planilla_retiro: { Args: { p_retiro: string; p_pago: string }; Returns: undefined };
      fn_deshacer_retiro: { Args: { p_retiro: string; p_motivo?: string }; Returns: undefined };
      fn_agregar_retiro_manual: {
        Args: { p_fecha: string; p_monto: number; p_motivo: string | null; p_fuente: string };
        Returns: string;
      };
      fn_borrar_retiro: { Args: { p_id: string }; Returns: undefined };
      app_listar_retiros_ext: {
        Args: { p_anio: number; p_mes: number };
        Returns: {
          id: string;
          fecha: string;
          control_caja: string | null;
          monto: number;
          motivo: string | null;
          cajero: string | null;
          caja: string | null;
          estado: "pendiente" | "ingresado" | "na";
          mov_tipo: "gasto" | "pago" | "planilla" | null;
          mov_desc: string | null;
          asiento_id: string | null;
          asiento_numero: number | null;
          sug_gasto_id: string | null;
          sug_fecha: string | null;
          sug_desc: string | null;
          sug_dif_dias: number | null;
        }[];
      };
      app_listar_clientes_ext: {
        Args: Record<string, never>;
        Returns: { id: string; nombre: string; orden: number; activo: boolean }[];
      };
      fn_guardar_cliente_ext: { Args: { p_id: string | null; p_nombre: string; p_orden: number }; Returns: string };
      fn_desactivar_cliente_ext: { Args: { p_id: string; p_activo: boolean }; Returns: undefined };
      fn_guardar_venta_ext: { Args: { p_cliente: string; p_fecha: string; p_monto: number }; Returns: undefined };
      app_ventas_ext_mes: {
        Args: { p_anio: number; p_mes: number };
        Returns: { cliente_id: string; dia: number; monto: number }[];
      };
      fn_importar_ventas_ext: {
        Args: { p_filas: unknown };
        Returns: { celdas: number; clientes_nuevos: number }[];
      };
      app_salidas_ext_mes: {
        Args: { p_anio: number; p_mes: number };
        Returns: { id: string; fecha: string; descripcion: string | null; monto: number }[];
      };
      fn_guardar_salida_ext: {
        Args: { p_id: string | null; p_fecha: string; p_descripcion: string | null; p_monto: number };
        Returns: string;
      };
      fn_borrar_salida_ext: { Args: { p_id: string }; Returns: undefined };
      app_planillas_pendientes: {
        Args: Record<string, never>;
        Returns: { id: string; titulo: string; fecha: string; neto: number; pagado: number; saldo: number }[];
      };
      fn_pagar_factura_caja_dif: {
        Args: {
          p_retiro: string;
          p_cxp: string;
          p_cuenta_caja: string;
          p_monto_caja: number;
          p_cuenta_dif: string | null;
          p_centro_dif: string | null;
        };
        Returns: string;
      };
      app_listar_requisitos: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          codigo: string;
          nombre: string;
          grupo: string;
          alcance: "global" | "centro" | "cuenta_banco";
          auto_fuente: string | null;
          centros: string[] | null;
          requiere_archivo: boolean;
          orden: number;
          activo: boolean;
        }[];
      };
      app_listar_roles: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          codigo: string;
          nombre: string;
          descripcion: string | null;
          es_sistema: boolean;
          estado: Estado;
          n_permisos: number;
          n_usuarios: number;
        }[];
      };
      app_listar_permisos: {
        Args: Record<string, never>;
        Returns: { id: string; modulo: string; accion: string; codigo: string; descripcion: string | null }[];
      };
      app_permisos_rol: { Args: { p_rol: string }; Returns: { permiso_id: string }[] };
      app_permisos_usuario: {
        Args: { p_usuario: string };
        Returns: { permiso_id: string; efecto: "conceder" | "revocar" }[];
      };
      app_listar_auditoria: {
        Args: {
          p_usuario?: string | null;
          p_tabla?: string | null;
          p_accion?: string | null;
          p_desde?: string | null;
          p_hasta?: string | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: {
          id: number;
          tabla: string;
          registro_id: string;
          accion: "insert" | "update" | "delete";
          usuario_id: string | null;
          usuario_nombre: string | null;
          usuario_email: string | null;
          datos_antes: Record<string, unknown> | null;
          datos_despues: Record<string, unknown> | null;
          ocurrido_en: string;
        }[];
      };
      app_auditoria_tablas: { Args: Record<string, never>; Returns: { tabla: string; n: number }[] };
      app_auditoria_usuarios: { Args: Record<string, never>; Returns: { usuario_id: string; nombre_completo: string }[] };
      fn_ligar_costo_producto: { Args: { p_codigo: string; p_producto_id: string; p_nombre: string }; Returns: undefined };
      fn_desligar_costo_producto: { Args: { p_codigo: string }; Returns: undefined };
      fn_asignar_alias_proveedor: { Args: { p_proveedor: string; p_alias: string }; Returns: string };
      fn_borrar_alias_proveedor: { Args: { p_id: string }; Returns: undefined };
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
      fn_saldo_caja: {
        Args: { p_fecha: string };
        Returns: number;
      };
      fn_detalle_bancario_cuenta: {
        Args: { p_cuenta: string; p_desde: string; p_hasta: string };
        Returns: {
          centro_codigo: string;
          fecha: string;
          referencia: string | null;
          descripcion: string | null;
          monto: number;
          conciliado: boolean;
          origen_tipo: string | null;
          origen_id: string | null;
          asiento_id: string;
        }[];
      };
      fn_flujo_caja: {
        Args: { p_desde: string; p_hasta: string };
        Returns: {
          categoria: string;
          tipo: "entrada" | "salida";
          cuenta_codigo: string;
          cuenta_nombre: string;
          monto: number;
        }[];
      };
      fn_compromisos: {
        Args: { p_fecha: string };
        Returns: { categoria: string; cuenta_codigo: string; cuenta_nombre: string; saldo: number }[];
      };
      app_mayor_cuenta: {
        Args: {
          p_cuenta_id: string;
          p_desde?: string | null;
          p_hasta?: string | null;
          p_excluir_prorrateo?: boolean;
          p_excluir_anulados?: boolean;
        };
        Returns: {
          fecha: string;
          asiento_id: string;
          asiento_tipo: AsientoTipo;
          asiento_numero: number | null;
          asiento_estado: string;
          glosa: string;
          centro_codigo: string | null;
          origen_tipo: string | null;
          origen_id: string | null;
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
      fn_crear_venta_dia: {
        Args: {
          p_centro: string;
          p_fecha: string;
          p_gravado: number;
          p_exento: number;
          p_iva: number;
          p_glosa: string | null;
          p_efectivo?: number;
          p_tarjeta?: number;
          p_sinpe?: number;
        };
        Returns: string;
      };
      fn_confirmar_venta_dia: { Args: { p_venta: string }; Returns: string };
      fn_anular_venta_dia: { Args: { p_venta: string; p_motivo: string }; Returns: undefined };
      fn_crear_gasto: {
        Args: {
          p_centro: string;
          p_fecha: string;
          p_cuenta_gasto: string;
          p_cuenta_pago: string | null;
          p_subtotal: number;
          p_iva: number;
          p_descripcion: string | null;
          p_proveedor?: string | null;
          p_vencimiento?: string | null;
        };
        Returns: string;
      };
      fn_confirmar_gasto: { Args: { p_gasto: string }; Returns: string };
      fn_anular_gasto: { Args: { p_gasto: string; p_motivo: string }; Returns: undefined };
      fn_crear_conciliacion: {
        Args: { p_cuenta: string; p_fecha_corte: string; p_saldo_inicial: number; p_saldo_final: number; p_lineas: unknown };
        Returns: string;
      };
      fn_conciliar_linea: { Args: { p_linea: string; p_asiento_linea: string }; Returns: undefined };
      fn_conciliar_grupo: { Args: { p_asiento_linea: string; p_lineas: string[] }; Returns: undefined };
      fn_conciliar_grupo_libros: {
        Args: { p_linea: string; p_asiento_lineas: string[]; p_tolerancia?: number };
        Returns: undefined;
      };
      fn_crear_nota_credito: {
        Args: {
          p_proveedor: string;
          p_fecha?: string | null;
          p_cuenta: string;
          p_centro?: string | null;
          p_subtotal: number;
          p_iva?: number;
          p_referencia?: string | null;
          p_glosa?: string | null;
        };
        Returns: string;
      };
      fn_anular_nota_credito: { Args: { p_nc: string; p_motivo: string }; Returns: undefined };
      fn_editar_nota_credito: {
        Args: {
          p_nc: string;
          p_fecha?: string | null;
          p_cuenta: string;
          p_centro?: string | null;
          p_subtotal: number;
          p_iva?: number;
          p_referencia?: string | null;
          p_glosa?: string | null;
        };
        Returns: string;
      };
      fn_conciliar_redondeo: { Args: { p_linea: string; p_asiento_linea: string; p_tolerancia?: number }; Returns: undefined };
      fn_desconciliar_linea: { Args: { p_linea: string }; Returns: undefined };
      fn_marcar_conciliada: { Args: { p_conciliacion: string }; Returns: undefined };
      fn_reabrir_conciliacion: { Args: { p_conciliacion: string }; Returns: undefined };
      fn_agregar_lineas_conciliacion: { Args: { p_conciliacion: string; p_saldo_final: number; p_lineas: unknown }; Returns: number };
      fn_anular_conciliacion: { Args: { p_conciliacion: string; p_motivo: string }; Returns: undefined };
      fn_actualizar_gasto: {
        Args: {
          p_gasto: string;
          p_centro: string;
          p_fecha: string;
          p_cuenta_gasto: string;
          p_cuenta_pago: string | null;
          p_subtotal: number;
          p_iva: number;
          p_descripcion: string | null;
          p_proveedor?: string | null;
          p_vencimiento?: string | null;
        };
        Returns: undefined;
      };
      fn_crear_costo_mes: {
        Args: { p_periodo: string; p_consumo_teorico: number; p_lineas: unknown };
        Returns: string;
      };
      fn_confirmar_costo_mes: { Args: { p_mes: string }; Returns: string };
      fn_anular_costo_mes: { Args: { p_mes: string; p_motivo: string }; Returns: undefined };
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
