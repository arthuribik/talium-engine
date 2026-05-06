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
  private client: Resend | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (apiKey) {
      this.client = new Resend(apiKey);
      console.log('Resend client initialized');
    } else {
      console.warn(
        'RESEND_API_KEY is not set. Email functionality will be disabled.',
      );
    }
  }

  isConfigured() {
    return Boolean(this.client);
  }

  async send(data: any, template: string) {
    if (!this.client) {
      console.warn(
        'Resend client is not initialized. Email not sent. Set RESEND_API_KEY to enable email functionality.',
      );
      return { data: { id: 'mock-id' }, error: null };
    }

    const params = this.build(data, template);

    try {
      const result = await this.client.emails.send(params);
      console.log('RS outbound mail result:', result);
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
      'taldium Notifications',
    )} <${this.configService.get<string>('MAIL_FROM', 'no-reply@notifications.yebox.net')}>`;

    return {
      to: Array.isArray(data.to) ? data.to : [data.to],
      subject: data.subject,
      from,
      html,
    };
  }
}
