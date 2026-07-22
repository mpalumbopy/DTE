import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CatError } from '../../entities/cat-error.entity';

const TTL_MS = 5 * 60 * 1000;

@Injectable()
export class CatalogoErrorService {
  private cache = new Map<string, CatError>();
  private cargadoEn = 0;

  constructor(@InjectRepository(CatError) private readonly repo: Repository<CatError>) {}

  private async asegurarCache(): Promise<void> {
    if (this.cache.size > 0 && Date.now() - this.cargadoEn < TTL_MS) {
      return;
    }
    const filas = await this.repo.find({ where: { vigente: true } });
    this.cache = new Map(filas.map((fila) => [fila.codigo, fila]));
    this.cargadoEn = Date.now();
  }

  async buscar(codigo: string): Promise<CatError | undefined> {
    await this.asegurarCache();
    return this.cache.get(codigo);
  }
}
