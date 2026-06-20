import nodemailer from "nodemailer";
import { config } from "../config.js";
import { log, logProcessFinished, logProcessStarted } from "../logger.js";

export class EmailService {
  constructor() {
    this.transport = config.smtpHost
      ? nodemailer.createTransport({
          host: config.smtpHost,
          port: config.smtpPort,
          secure: config.smtpPort === 465,
          requireTLS: config.smtpUseTls && config.smtpPort !== 465,
          auth: config.smtpUsername
            ? { user: config.smtpUsername, pass: config.smtpPassword }
            : undefined,
        })
      : null;
  }

  async send({ recipient, subject, body }) {
    logProcessStarted("Send email", { recipient, subject });
    if (!this.transport) {
      log("warn", "email_delivery_skipped", {
        recipient,
        subject,
        preview: config.appEnv === "development" ? body : undefined,
      });
      logProcessFinished("Send email", {
        recipient,
        subject,
        skipped: true,
      });
      return;
    }
    await this.transport.sendMail({
      from: config.smtpFromEmail,
      to: recipient,
      subject,
      text: body,
    });
    logProcessFinished("Send email", { recipient, subject, skipped: false });
  }
}

export const emailService = new EmailService();
