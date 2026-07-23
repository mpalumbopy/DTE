import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorDominio } from '@psdte/shared';
import { DocumentoIdentidadInput } from '@psdte/xml-engine';
import { Persona } from '../../entities/persona.entity';
import { Usuario } from '../../entities/usuario.entity';
import { CatPais } from '../../entities/cat-pais.entity';
import { CatTipoDocumentoIdentidad } from '../../entities/cat-tipo-documento-identidad.entity';
import { ParametroSistema } from '../../entities/parametro-sistema.entity';

export interface PrestadorServicioResumen {
  nombre: string;
  ruc: string;
}

/** Resolución de documento/prestador compartida por endoso, pago, bloqueo y cancelación. */
@Injectable()
export class EventosComunesService {
  constructor(
    @InjectRepository(Usuario) private readonly usuarioRepo: Repository<Usuario>,
    @InjectRepository(CatPais) private readonly paisRepo: Repository<CatPais>,
    @InjectRepository(CatTipoDocumentoIdentidad) private readonly tipoDocumentoRepo: Repository<CatTipoDocumentoIdentidad>,
    @InjectRepository(ParametroSistema) private readonly parametrosRepo: Repository<ParametroSistema>,
  ) {}

  /** El actor de un evento (endoso/pago/bloqueo/cancelación) actúa como la persona vinculada a su
   * usuario de login — ver docs/PLAN.md sección 5.2 ("TENEDOR vigente"). */
  async resolverPersonaIdDeUsuario(usuarioId: string): Promise<string> {
    const usuario = await this.usuarioRepo.findOneOrFail({ where: { id: usuarioId } });
    if (!usuario.personaId) {
      throw new ErrorDominio('ERR-SEM-002', `El usuario ${usuarioId} no tiene una persona vinculada`);
    }
    return usuario.personaId;
  }

  async resolverDocumentoIdentidad(persona: Persona): Promise<DocumentoIdentidadInput> {
    const [tipoDocumento, pais] = await Promise.all([
      this.tipoDocumentoRepo.findOneOrFail({ where: { codigo: persona.tipoDocumento } }),
      this.paisRepo.findOneOrFail({ where: { codigo: persona.paisDocumento } }),
    ]);
    return {
      codigoTipo: persona.tipoDocumento,
      tipo: tipoDocumento.sigla,
      numero: persona.numeroDocumento,
      codigoPais: persona.paisDocumento,
      pais: pais.nombre,
    };
  }

  async resolverPrestadorServicio(): Promise<PrestadorServicioResumen> {
    const parametro = await this.parametrosRepo.findOneOrFail({ where: { clave: 'psdte.datos' } });
    const valor = parametro.valor as { nombre: string; ruc: string };
    return { nombre: valor.nombre, ruc: valor.ruc };
  }
}
