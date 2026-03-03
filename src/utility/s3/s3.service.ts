import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  PutObjectCommandInput,
} from '@aws-sdk/client-s3';

export interface UploadOptions {
  contentType?: string;
  /** S3 key prefix (e.g. 'id-documents', 'location-documents'). No leading/trailing slash. */
  prefix?: string;
}

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly region: string;

  constructor(private config: ConfigService) {
    const accessKey = this.config.get<string>('AWS_ACCESS_KEY');
    const secretKey = this.config.get<string>('AWS_SECRET_KEY');
    this.region = this.config.get<string>('AWS_S3_REGION') ?? 'eu-west-3';
    this.bucket = this.config.get<string>('AWS_S3_BUCKET') ?? '';

    this.client = new S3Client({
      region: this.region,
      ...(accessKey && secretKey
        ? {
            credentials: {
              accessKeyId: accessKey,
              secretAccessKey: secretKey,
            },
          }
        : {}),
    });
  }

  /**
   * Upload a buffer to S3 and return the public object URL.
   * Key format: {prefix}/{filename} (e.g. id-documents/profId-timestamp-name.ext)
   */
  async upload(
    buffer: Buffer,
    filename: string,
    options: UploadOptions = {},
  ): Promise<string> {
    const prefix = options.prefix ?? 'uploads';
    const key = prefix ? `${prefix}/${filename}` : filename;

    const params: PutObjectCommandInput = {
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: options.contentType ?? undefined,
    };

    await this.client.send(new PutObjectCommand(params));

    return this.getPublicUrl(key);
  }

  /** Build the public URL for an S3 object (standard virtual-hosted style). */
  getPublicUrl(key: string): string {
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }
}
