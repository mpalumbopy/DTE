import { ClienteHttp, ConfigClienteHttp } from './cliente-http';
import { interpolarPlantilla, mapearRespuesta } from './plantilla';

export interface MapeoOperacion {
  request?: Record<string, unknown>;
  /** Valores string = JSONPath; claves `map_<campo>` = tabla de traducción de valores (ver plantilla.ts). */
  response?: Record<string, string | Record<string, string>>;
}

export interface ConfigAdaptadorHttp {
  cliente: ConfigClienteHttp;
  endpoints: Record<string, string>;
  mapeoPayload: Record<string, MapeoOperacion>;
}

/** Base común a los 3 adaptadores HTTP genéricos: arma el request desde la plantilla y mapea la respuesta. */
export abstract class AdaptadorHttpBase {
  protected readonly cliente: ClienteHttp;

  constructor(protected readonly config: ConfigAdaptadorHttp) {
    this.cliente = new ClienteHttp(config.cliente);
  }

  protected ruta(operacion: string, valoresPlaceholder: Record<string, string> = {}): string {
    let ruta = this.config.endpoints[operacion];
    if (!ruta) {
      throw new Error(`No hay endpoint configurado para la operación "${operacion}"`);
    }
    for (const [clave, valor] of Object.entries(valoresPlaceholder)) {
      ruta = ruta.replace(`{${clave}}`, encodeURIComponent(valor));
    }
    return ruta;
  }

  protected async llamar(
    operacion: string,
    ruta: string,
    contexto: Record<string, unknown>,
    metodo: 'POST' | 'GET' = 'POST',
  ): Promise<Record<string, unknown>> {
    const mapeo = this.config.mapeoPayload[operacion];
    const cuerpo = metodo === 'GET' ? undefined : mapeo?.request ? interpolarPlantilla(mapeo.request, contexto) : contexto;
    const { cuerpo: respuesta } = await this.cliente.solicitar(ruta, { metodo, cuerpo });
    return mapeo?.response ? mapearRespuesta(respuesta, mapeo.response) : ((respuesta ?? {}) as Record<string, unknown>);
  }
}
