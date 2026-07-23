import { Body, Controller, ForbiddenException, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Parse, canonicalizarExclusivo, serializar } from '@psdte/xml-engine';
import { Roles } from '../../common/decorators/roles.decorator';
import { EnvConfig } from '../../config/config.schema';
import { ProviderFactoryService } from '../integraciones/provider-factory.service';
import { FirmarTextoDto } from './dto/firmar-texto.dto';

/** Utilidad de desarrollo (sección 8): firma manual contra el simulador, para inspeccionar el
 * resultado sin pasar por un flujo de DTE completo. Nunca disponible si ALLOW_SIMULATOR=false
 * (producción) — en ese caso no tendría sentido: no hay simulador que invocar. */
@Controller({ path: 'dev', version: '1' })
@Roles('ADMIN_PSDTE')
export class DevController {
  constructor(
    private readonly providerFactory: ProviderFactoryService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  @Post('firmador')
  async firmar(@Body() dto: FirmarTextoDto) {
    if (!this.configService.get('ALLOW_SIMULATOR', { infer: true })) {
      throw new ForbiddenException('El firmador de desarrollo requiere ALLOW_SIMULATOR=true');
    }

    const documento = Parse(`<devFirmador id="dev-firmador-manual"><texto>${escaparXml(dto.texto)}</texto></devFirmador>`);
    const xmlCanonico = Buffer.from(canonicalizarExclusivo(documento.documentElement), 'utf8');

    const firmaProvider = await this.providerFactory.obtenerProveedorFirma();
    const resultado = await firmaProvider.solicitarFirma({
      solicitudId: `dev-firmador-${Date.now()}`,
      xmlCanonico,
      referencias: [],
      uriNodoPrincipal: '#dev-firmador-manual',
      firmante: { documento: dto.documentoFirmante ?? '0000000', tipoDocumento: 'CI', nombre: dto.nombreFirmante ?? 'Firmante de prueba' },
      rolFirmante: 'DEV',
      callbackUrl: '',
      expiraEn: new Date(Date.now() + 15 * 60_000),
    });

    if (resultado.estado !== 'FIRMADA' || !resultado.xadesXml) {
      throw new ForbiddenException('El simulador no devolvió una firma');
    }
    const documentoFirmado = Parse(resultado.xadesXml);
    return {
      xadesXml: serializar(documentoFirmado),
      providerRef: resultado.providerRef,
    };
  }
}

function escaparXml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
