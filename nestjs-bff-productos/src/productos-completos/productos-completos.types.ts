export interface Producto {
  id: number;
  nombre: string;
  precio: number;
}

export interface ProductoRest extends Producto {
  categoria?: string | null;
}

export type EstadoFuente = 'ok' | 'no-disponible';

export interface DatosGraphql {
  /** true si GraphQL devuelve el mismo producto (id, nombre y precio) que REST. */
  coincide: boolean;
  /** Productos con precio menor o igual al del producto consultado (sin incluirlo). */
  alternativasMasBaratasOIguales: Producto[];
}

export interface ProductoCompleto extends Producto {
  graphql: DatosGraphql | null;
  fuentes: { rest: EstadoFuente; graphql: EstadoFuente };
  fuente: 'aggregator';
  correlationId: string | null;
  /** Solo aparece cuando una fuente secundaria fallo: explica por que. */
  avisos?: string[];
}
