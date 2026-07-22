import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorDominio } from '@psdte/shared';
import { ParametroSistema } from '../../entities/parametro-sistema.entity';
import { ActualizarParametroDto } from './dto/actualizar-parametro.dto';

@Injectable()
export class ParametrosService {
  constructor(
    @InjectRepository(ParametroSistema) private readonly parametros: Repository<ParametroSistema>,
  ) {}

  async listar(): Promise<ParametroSistema[]> {
    return this.parametros.find({ order: { clave: 'ASC' } });
  }

  async obtener(clave: string): Promise<ParametroSistema> {
    const parametro = await this.parametros.findOne({ where: { clave } });
    if (!parametro) {
      throw new ErrorDominio('ERR-PARAM-404', `Parámetro inexistente: ${clave}`);
    }
    return parametro;
  }

  async actualizar(clave: string, dto: ActualizarParametroDto, actualizadoPor: string): Promise<ParametroSistema> {
    const parametro = await this.obtener(clave);
    if (!parametro.editable) {
      throw new ErrorDominio('ERR-PARAM-403', `El parámetro ${clave} no es editable`);
    }
    parametro.valor = dto.valor;
    parametro.actualizadoPor = actualizadoPor;
    return this.parametros.save(parametro);
  }
}
