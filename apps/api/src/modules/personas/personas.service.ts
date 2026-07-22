import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { ErrorDominio } from '@psdte/shared';
import { Persona } from '../../entities/persona.entity';
import { CrearPersonaDto } from './dto/crear-persona.dto';
import { ActualizarPersonaDto } from './dto/actualizar-persona.dto';

const POSTGRES_UNIQUE_VIOLATION = '23505';

@Injectable()
export class PersonasService {
  constructor(@InjectRepository(Persona) private readonly personas: Repository<Persona>) {}

  async crear(dto: CrearPersonaDto): Promise<Persona> {
    const persona = this.personas.create({
      tipoPersona: dto.tipoPersona,
      nombresApellidos: dto.nombresApellidos ?? null,
      razonSocial: dto.razonSocial ?? null,
      tipoDocumento: dto.tipoDocumento,
      numeroDocumento: dto.numeroDocumento,
      paisDocumento: dto.paisDocumento,
      ruc: dto.ruc ?? null,
      email: dto.email ?? null,
      telefono: dto.telefono ?? null,
    });
    try {
      return await this.personas.save(persona);
    } catch (err) {
      if (err instanceof QueryFailedError && (err as unknown as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION) {
        throw new ErrorDominio('ERR-PERSONA-409', 'Ya existe una persona con ese tipo y número de documento');
      }
      throw err;
    }
  }

  async obtener(id: string): Promise<Persona> {
    const persona = await this.personas.findOne({ where: { id } });
    if (!persona) {
      throw new ErrorDominio('ERR-DTE-404', 'Persona inexistente');
    }
    return persona;
  }

  async buscarPorDocumento(numeroDocumento: string): Promise<Persona[]> {
    return this.personas.find({ where: { numeroDocumento } });
  }

  async listar(): Promise<Persona[]> {
    return this.personas.find({ order: { creadoEn: 'ASC' } });
  }

  async actualizar(id: string, dto: ActualizarPersonaDto): Promise<Persona> {
    const persona = await this.obtener(id);
    Object.assign(persona, {
      nombresApellidos: dto.nombresApellidos ?? persona.nombresApellidos,
      razonSocial: dto.razonSocial ?? persona.razonSocial,
      ruc: dto.ruc ?? persona.ruc,
      email: dto.email ?? persona.email,
      telefono: dto.telefono ?? persona.telefono,
    });
    return this.personas.save(persona);
  }
}
