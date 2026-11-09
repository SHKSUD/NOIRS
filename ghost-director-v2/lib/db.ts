import { PrismaClient } from '@prisma/client';

// One client per process (dev hot-reload would otherwise open many).
// GD_DATABASE_URL lets tests point at a throwaway database.
const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient(
  process.env.GD_DATABASE_URL ? { datasources: { db: { url: process.env.GD_DATABASE_URL } } } : undefined,
);
if (process.env.NODE_ENV !== 'production') g.prisma = db;
