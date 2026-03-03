import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Serve uploaded files (e.g. ID documents)
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });

  // Enable CORS with explicit configuration
  const allowedOrigins = [
    'http://localhost:5231',
    'http://localhost:3000',
    'https://taldium-webapp.onrender.com',
    process.env.FRONTEND_URL,
  ].filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) {
        return callback(null, true);
      }
      
      // Check if origin is in allowed list or if it's a Render subdomain
      if (
        allowedOrigins.includes(origin) ||
        origin.includes('.onrender.com') ||
        origin.includes('localhost')
      ) {
        return callback(null, true);
      }
      
      // In development, allow all origins
      if (process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      
      callback(null, true); // Allow all for now, can be restricted later
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],
    exposedHeaders: ['Authorization'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // API prefix
  app.setGlobalPrefix('v1');

  // Logging middleware for debugging (only in production)
  if (process.env.NODE_ENV === 'production') {
    app.use((req: any, res: any, next: any) => {
      // Log Authorization header presence (without logging the actual token)
      const hasAuth = !!req.headers.authorization;
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - Auth: ${hasAuth ? 'Present' : 'Missing'}`);
      next();
    });
  }

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Taldium API')
    .setDescription('Taldium Platform API Documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 5103;
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);
  console.log(`Application is running on: http://${host}:${port}`);
  console.log(`Swagger documentation: http://${host}:${port}/docs`);
}

bootstrap();
