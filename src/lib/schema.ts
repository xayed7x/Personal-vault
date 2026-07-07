import { pgTable, uuid, varchar, text, timestamp, integer, primaryKey, customType } from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea';
  },
  toDriver(value: Buffer): Buffer {
    return value;
  },
  fromDriver(value: unknown): Buffer {
    return value as Buffer;
  },
});

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: varchar('username', { length: 50 }).notNull().unique(),
  authHash: varchar('auth_hash', { length: 255 }).notNull(),
  clientSalt: varchar('client_salt', { length: 64 }).notNull(),
  encryptedVaultKey: text('encrypted_vault_key').notNull(),
  vaultKeyIv: varchar('vault_key_iv', { length: 32 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  userAgent: varchar('user_agent', { length: 255 }),
  ipAddress: varchar('ip_address', { length: 45 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const images = pgTable('images', {
  id: uuid('id').defaultRandom().primaryKey(),
  encryptedMetadata: text('encrypted_metadata').notNull(),
  metadataIv: varchar('metadata_iv', { length: 32 }).notNull(),
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const imageData = pgTable('image_data', {
  imageId: uuid('image_id').primaryKey().references(() => images.id, { onDelete: 'cascade' }),
  encryptedFile: bytea('encrypted_file').notNull(),
});

export const rateLimits = pgTable('rate_limits', {
  ipAddress: varchar('ip_address', { length: 45 }).notNull(),
  endpoint: varchar('endpoint', { length: 100 }).notNull(),
  requestCount: integer('request_count').default(1).notNull(),
  windowStart: timestamp('window_start').notNull(),
}, (table) => [
  primaryKey({ columns: [table.ipAddress, table.endpoint] })
]);
