import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { EnvConfig } from '../../config/config.schema';
import { Notificacion } from '../../entities/notificacion.entity';
import { renderizarNotificacion } from './plantillas';

export interface CrearNotificacionInput {
  tipoCodigo: number;
  dteId?: string | null;
  eventoId?: string | null;
  destinatarioPersonaId?: string | null;
  destino: string;
  datosPlantilla: Record<string, unknown>;
}

export interface ResultadoEnvioPendientes {
  enviadas: number;
  fallidas: number;
}

/**
 * Creación y envío de notificaciones (docs/PLAN.md sección 9/11, CAT-DTE-09): `crear` la usan
 * EmisionService/EndosoService/PagoService/BloqueoService/CancelacionService en el momento del
 * evento de dominio; `enviarPendientes` es el "job" de envío (invocable directamente — sin
 * cola/cron todavía, mismo motivo que los demás jobs diferidos de F7/F9).
 */
@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger(NotificacionesService.name);
  private transportador?: Transporter;

  constructor(
    @InjectRepository(Notificacion) private readonly notificacionRepo: Repository<Notificacion>,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async crear(input: CrearNotificacionInput): Promise<Notificacion> {
    const { asunto, cuerpo } = renderizarNotificacion(input.tipoCodigo, input.datosPlantilla);
    return this.notificacionRepo.save(
      this.notificacionRepo.create({
        tipoCodigo: input.tipoCodigo,
        dteId: input.dteId ?? null,
        eventoId: input.eventoId ?? null,
        destinatarioPersonaId: input.destinatarioPersonaId ?? null,
        destino: input.destino,
        asunto,
        cuerpo,
        estado: 'PENDIENTE',
      }),
    );
  }

  async enviarPendientes(): Promise<ResultadoEnvioPendientes> {
    const pendientes = await this.notificacionRepo.find({ where: { estado: 'PENDIENTE' } });
    let enviadas = 0;
    let fallidas = 0;

    for (const notificacion of pendientes) {
      try {
        await this.obtenerTransportador().sendMail({
          from: this.configService.get('SMTP_FROM', { infer: true }),
          to: notificacion.destino,
          subject: notificacion.asunto ?? '(sin asunto)',
          text: notificacion.cuerpo ?? '',
        });
        notificacion.estado = 'ENVIADA';
        notificacion.enviadaEn = new Date();
        notificacion.errorMensaje = null;
        enviadas += 1;
      } catch (err) {
        notificacion.estado = 'FALLIDA';
        notificacion.intentos += 1;
        notificacion.errorMensaje = err instanceof Error ? err.message : String(err);
        fallidas += 1;
        this.logger.warn(`Fallo al enviar notificación ${notificacion.id}: ${notificacion.errorMensaje}`);
      }
      await this.notificacionRepo.save(notificacion);
    }

    return { enviadas, fallidas };
  }

  private obtenerTransportador(): Transporter {
    if (!this.transportador) {
      const usuario = this.configService.get('SMTP_USER', { infer: true });
      const clave = this.configService.get('SMTP_PASS', { infer: true });
      this.transportador = createTransport({
        host: this.configService.get('SMTP_HOST', { infer: true }),
        port: this.configService.get('SMTP_PORT', { infer: true }),
        secure: false,
        auth: usuario ? { user: usuario, pass: clave } : undefined,
        tls: { rejectUnauthorized: false },
      });
    }
    return this.transportador;
  }
}
