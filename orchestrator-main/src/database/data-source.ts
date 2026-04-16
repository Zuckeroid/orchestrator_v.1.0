import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { DATABASE_ENTITIES } from './database.module';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER ?? 'orchestrator',
  password: process.env.DB_PASS ?? 'orchestrator',
  database: process.env.DB_NAME ?? 'orchestrator',
  entities: DATABASE_ENTITIES,
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
});
