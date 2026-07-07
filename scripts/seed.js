const { pbkdf2Sync, randomBytes, createCipheriv } = require('crypto');
const { Client } = require('pg');
const { parse } = require('pg-connection-string');
const readline = require('readline');
const { hash, Algorithm } = require('@node-rs/argon2');
require('dotenv').config({ path: '.env.local' });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

/**
 * Prompts user for sensitive password input, masking characters with asterisks.
 */
function questionSecure(query) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    
    stdout.write(query);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    
    let password = '';
    
    const onData = (char) => {
      // Handle Ctrl+C (abort)
      if (char === '\u0003') {
        process.exit(1);
      }
      // Handle Enter
      if (char === '\r' || char === '\n') {
        stdin.removeListener('data', onData);
        stdin.setRawMode(false);
        stdin.pause();
        stdout.write('\n');
        resolve(password);
        return;
      }
      // Handle Backspace
      if (char === '\u007f' || char === '\b') {
        if (password.length > 0) {
          password = password.slice(0, -1);
          readline.clearLine(stdout, 0);
          readline.cursorTo(stdout, 0);
          stdout.write(query + '*'.repeat(password.length));
        }
        return;
      }
      
      // Standard input character
      password += char;
      stdout.write('*');
    };
    
    stdin.on('data', onData);
  });
}

function validatePassword(password) {
  if (password.length < 18) return 'Password must be at least 18 characters long.';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain at least one symbol.';
  return null;
}

async function getCredentials(userNum, defaultUsername, defaultPassword) {
  if (defaultUsername && defaultPassword) {
    console.log(`\n--- Configure User ${userNum} (via CLI args) ---`);
    console.log(`Username: ${defaultUsername}`);
    const error = validatePassword(defaultPassword);
    if (error) {
      console.error(error);
      process.exit(1);
    }
    return { username: defaultUsername, password: defaultPassword };
  }

  console.log(`\n--- Configure User ${userNum} ---`);
  const username = await question(`Username: `);
  if (!username.trim()) {
    console.error('Username cannot be empty.');
    process.exit(1);
  }
  
  // Use masked secure input for passwords
  const password = await questionSecure(`Password (min 18 chars, upper, lower, num, symbol): `);
  const error = validatePassword(password);
  if (error) {
    console.error(error);
    process.exit(1);
  }
  return { username, password };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL is not set in .env.local');
    process.exit(1);
  }

  console.log('Zero-Knowledge Vault Seeding Script');
  
  // Support CLI arguments for non-interactive automation (CI or background tasks)
  const args = process.argv.slice(2);
  const user1Args = args[0] && args[1] ? { username: args[0], password: args[1] } : null;
  const user2Args = args[2] && args[3] ? { username: args[2], password: args[3] } : null;

  const user1 = await getCredentials(1, user1Args?.username, user1Args?.password);
  const user2 = await getCredentials(2, user2Args?.username, user2Args?.password);

  if (user1.username === user2.username) {
    console.error('Usernames must be different.');
    process.exit(1);
  }

  // Generate a random 256-bit VaultKey
  const vaultKey = randomBytes(32);

  const usersData = [];

  for (const user of [user1, user2]) {
    // Generate unique 32-byte client salt
    const clientSalt = randomBytes(32);
    const clientSaltStr = clientSalt.toString('hex');
    
    // Client-side key derivation (simulated using raw bytes to match browser clientCrypto.ts)
    console.log(`Deriving keys for ${user.username} (600,000 iterations, please wait...)...`);
    const derivedKey = pbkdf2Sync(user.password, clientSalt, 600000, 64, 'sha256');
    const masterKey = derivedKey.subarray(0, 32);
    const authHash = derivedKey.subarray(32, 64).toString('hex');

    // Encrypt the VaultKey with the MasterKey using AES-GCM
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', masterKey, iv);
    let encrypted = cipher.update(vaultKey);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();
    const encryptedVaultKey = Buffer.concat([encrypted, authTag]).toString('hex');
    const vaultKeyIv = iv.toString('hex');

    // Server-side hash the AuthHash using Argon2id
    console.log(`Argon2id hashing AuthHash for ${user.username}...`);
    const authHashServer = await hash(authHash, {
      algorithm: Algorithm.Argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    usersData.push({
      username: user.username,
      authHash: authHashServer,
      clientSalt: clientSaltStr,
      encryptedVaultKey,
      vaultKeyIv
    });
  }

  console.log('\nConnecting to database...');
  const dbConfig = parse(process.env.DATABASE_URL || '');
  const client = new Client({
    host: dbConfig.host || undefined,
    port: dbConfig.port ? parseInt(dbConfig.port, 10) : undefined,
    user: dbConfig.user || undefined,
    password: dbConfig.password || undefined,
    database: dbConfig.database || undefined,
    ssl: {
      rejectUnauthorized: false,
    },
  });
  await client.connect();

  try {
    console.log('Cleaning up existing users and sessions...');
    await client.query('TRUNCATE TABLE users, sessions CASCADE;');

    console.log('Inserting predefined users...');
    for (const u of usersData) {
      await client.query(
        `INSERT INTO users (username, auth_hash, client_salt, encrypted_vault_key, vault_key_iv)
         VALUES ($1, $2, $3, $4, $5);`,
        [u.username, u.authHash, u.clientSalt, u.encryptedVaultKey, u.vaultKeyIv]
      );
      console.log(`Successfully created user: ${u.username}`);
    }
    console.log('\nDatabase seeding completed successfully!');
  } catch (err) {
    console.error('Error inserting data:', err);
  } finally {
    await client.end();
    rl.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
