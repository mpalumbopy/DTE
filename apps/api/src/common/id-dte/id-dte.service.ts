import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ParametroSistema } from '../../entities/parametro-sistema.entity';

export interface SufijoIdDte {
  /** "AAAAMMDD" + "AAAAMMDD" + secuencial de 9 dígitos, compartido por vDTE/dDTE/eDTE (sección 5.3). */
  sufijo: string;
  secuencial: number;
}

function formatearAAAAMMDD(fecha: Date): string {
  return fecha.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Genera los identificadores del perfil pagaré-DTE (docs/PLAN.md sección 5.3):
 * `[prefijo][AAAAMMDD emisión][AAAAMMDD autorización][secuencial 9 dígitos]`, con prefijos
 * vDTE/dDTE/eDTE compartiendo el mismo sufijo, y `eDTE...-NNN` para cada evento. El secuencial sale
 * de `psdte.seq_dte` (nunca se reutiliza — I1) y la fecha de autorización, de
 * `parametro_sistema['psdte.fecha_autorizacion']`.
 */
@Injectable()
export class IdDteService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ParametroSistema) private readonly parametros: Repository<ParametroSistema>,
  ) {}

  async generarSufijo(fechaEmision: Date): Promise<SufijoIdDte> {
    const [fechaAutorizacion, secuencial] = await Promise.all([
      this.obtenerFechaAutorizacion(),
      this.siguienteSecuencial(),
    ]);
    const sufijo = `${formatearAAAAMMDD(fechaEmision)}${fechaAutorizacion}${String(secuencial).padStart(9, '0')}`;
    return { sufijo, secuencial };
  }

  idDte(sufijo: string): string {
    return `vDTE${sufijo}`;
  }

  idDatosGenerales(sufijo: string): string {
    return `dDTE${sufijo}`;
  }

  idEventos(sufijo: string): string {
    return `eDTE${sufijo}`;
  }

  idEvento(sufijo: string, numeroEvento: number): string {
    return `eDTE${sufijo}-${String(numeroEvento).padStart(3, '0')}`;
  }

  private async siguienteSecuencial(): Promise<number> {
    const filas: Array<{ nextval: string }> = await this.dataSource.query("SELECT nextval('psdte.seq_dte') AS nextval");
    return Number(filas[0].nextval);
  }

  private async obtenerFechaAutorizacion(): Promise<string> {
    const parametro = await this.parametros.findOneOrFail({ where: { clave: 'psdte.fecha_autorizacion' } });
    return parametro.valor as string;
  }
}
