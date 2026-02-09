import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export type SendEmailParams = {
  receivers: string[];
  subject: string;
  html: string;
  from?: string;
};

export interface MailOptions {
  to: string | string[];
  subject: string;
  html: string;
}

@Injectable()
export class ResendEntity implements OnModuleInit {
  private client: Resend;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.client = new Resend(this.configService.get<string>('RESEND_API_KEY'));
    console.log('Resend client initialized');
  }

  async send(data: any, template: string) {
    if (!this.client) {
      throw new Error('Resend client is not initialized');
    }

    const params = this.build(data, template);

    try {
      const result = await this.client.emails.send(params);
      console.log('Resend send result:', result?.data?.id);
      return result;
    } catch (error) {
      console.error('Resend send error:', error);
      throw error;
    }
  }

  build(data: any, html: string) {
    const from = `${this.configService.get<string>(
      'MAIL_SENDER',
      'Talium Notifications',
    )} <${this.configService.get<string>('MAIL_FROM', 'no-reply@notifications.yebox.net')}>`;

    return {
      to: Array.isArray(data.to) ? data.to : [data.to],
      subject: data.subject,
      from,
      html,
    };
  }
}
