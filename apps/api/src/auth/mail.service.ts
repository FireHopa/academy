import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

const MAIL_API_TIMEOUT_MS = 10_000;

@Injectable()
export class MailService {
  constructor(private readonly config: ConfigService) {}

  async send(to: string, subject: string, html: string) {
    const provider = String(this.config.get("MAIL_PROVIDER") ?? "disabled").toLowerCase();
    if (provider === "disabled") {
      if (this.config.get("NODE_ENV") !== "production") console.info(`[mail:disabled] ${subject} -> ${to}`);
      return { delivered: false };
    }
    if (provider !== "resend") throw new ServiceUnavailableException("MAIL_PROVIDER não suportado");

    const apiKey = this.config.get<string>("RESEND_API_KEY");
    const from = this.config.get<string>("MAIL_FROM");
    if (!apiKey || !from) throw new ServiceUnavailableException("RESEND_API_KEY/MAIL_FROM não configurados");

    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject, html }),
        signal: AbortSignal.timeout(MAIL_API_TIMEOUT_MS),
      });
    } catch {
      throw new ServiceUnavailableException("Serviço de e-mail indisponível ou fora do tempo limite");
    }
    if (!response.ok) throw new ServiceUnavailableException("Não foi possível enviar o e-mail");
    return { delivered: true };
  }
}
