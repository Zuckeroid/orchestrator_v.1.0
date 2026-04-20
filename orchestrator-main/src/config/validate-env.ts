type EnvConfig = Record<string, unknown>;

const REQUIRED_STRING_KEYS = [
  'DB_HOST',
  'DB_USER',
  'DB_PASS',
  'DB_NAME',
  'REDIS_HOST',
  'ADMIN_API_KEY',
  'WEBHOOK_API_KEY',
  'WEBHOOK_SIGNING_SECRET',
  'DATA_ENCRYPTION_KEY',
];

const DANGEROUS_PRODUCTION_DEFAULTS = new Map<string, string[]>([
  ['ADMIN_API_KEY', ['secret']],
  ['WEBHOOK_API_KEY', ['secret']],
  ['WEBHOOK_SIGNING_SECRET', ['secret']],
  ['DATA_ENCRYPTION_KEY', ['base64-secret', 'secret']],
  ['BILLING_API_KEY', ['secret']],
  ['STORAGE_ACCESS_KEY', ['access']],
  ['STORAGE_SECRET_KEY', ['secret']],
]);

export function validateEnv(config: EnvConfig): EnvConfig {
  const errors: string[] = [];
  const normalized = {
    ...config,
  };

  setDefault(normalized, 'NODE_ENV', 'development');
  setDefault(normalized, 'PORT', '3000');
  setDefault(normalized, 'ADMIN_UI_ORIGIN', 'http://localhost:5173');
  setDefault(normalized, 'DB_PORT', '5432');
  setDefault(normalized, 'DB_SYNCHRONIZE', 'false');
  setDefault(normalized, 'DB_MIGRATIONS_RUN', 'true');
  setDefault(normalized, 'REDIS_PORT', '6379');
  setDefault(normalized, 'WEBHOOK_SIGNATURE_TOLERANCE_SECONDS', '300');
  setDefault(normalized, 'PROVISION_CLEANUP_ENABLED', 'true');
  setDefault(normalized, 'PROVISION_CLEANUP_CRON', '*/15 * * * *');
  setDefault(normalized, 'PROVISION_CLEANUP_LIMIT', '50');
  setDefault(normalized, 'NODE_HEALTH_CHECK_ENABLED', 'true');
  setDefault(normalized, 'NODE_HEALTH_CHECK_CRON', '*/5 * * * *');
  setDefault(normalized, 'BILLING_PROVIDER', 'noop');
  setDefault(normalized, 'VPN_PROVIDER', 'noop');
  setDefault(normalized, 'VPN_TIMEOUT', '5000');
  setDefault(normalized, 'VPN_3XUI_LOGIN_PATH', 'login');
  setDefault(normalized, 'VPN_3XUI_INBOUNDS_PATH', 'panel/api/inbounds');
  setDefault(normalized, 'VPN_3XUI_SUB_PATH', 'sub');
  setDefault(normalized, 'VPN_3XUI_TLS_REJECT_UNAUTHORIZED', 'true');
  setDefault(normalized, 'VPN_3XUI_CLIENT_FLOW', 'xtls-rprx-vision');
  setDefault(normalized, 'VPN_3XUI_CLIENT_TOTAL_GB', '0');
  setDefault(normalized, 'VPN_3XUI_CLIENT_EXPIRY_TIME', '0');
  setDefault(normalized, 'STORAGE_TIMEOUT', '5000');

  for (const key of REQUIRED_STRING_KEYS) {
    requireString(normalized, key, errors);
  }

  validateInteger(normalized, 'PORT', errors, { min: 1, max: 65535 });
  validateInteger(normalized, 'DB_PORT', errors, { min: 1, max: 65535 });
  validateInteger(normalized, 'REDIS_PORT', errors, { min: 1, max: 65535 });
  validateInteger(normalized, 'WEBHOOK_SIGNATURE_TOLERANCE_SECONDS', errors, {
    min: 1,
  });
  validateInteger(normalized, 'PROVISION_CLEANUP_LIMIT', errors, { min: 1 });
  validateInteger(normalized, 'VPN_TIMEOUT', errors, { min: 1 });
  validateInteger(normalized, 'VPN_3XUI_CLIENT_TOTAL_GB', errors, { min: 0 });
  validateInteger(normalized, 'VPN_3XUI_CLIENT_EXPIRY_TIME', errors, {
    min: 0,
  });
  validateInteger(normalized, 'STORAGE_TIMEOUT', errors, { min: 1 });

  validateBoolean(normalized, 'DB_SYNCHRONIZE', errors);
  validateBoolean(normalized, 'DB_MIGRATIONS_RUN', errors);
  validateBoolean(normalized, 'PROVISION_CLEANUP_ENABLED', errors);
  validateBoolean(normalized, 'NODE_HEALTH_CHECK_ENABLED', errors);
  validateBoolean(normalized, 'VPN_3XUI_TLS_REJECT_UNAUTHORIZED', errors);

  validateEnum(normalized, 'NODE_ENV', ['development', 'test', 'production'], errors);
  validateEnum(normalized, 'BILLING_PROVIDER', ['noop', 'fossbilling'], errors);
  validateEnum(normalized, 'VPN_PROVIDER', ['noop', '3x-ui', 'threexui'], errors);
  validateOrigins(normalized, 'ADMIN_UI_ORIGIN', errors);
  validateCron(normalized, 'PROVISION_CLEANUP_CRON', errors);
  validateCron(normalized, 'NODE_HEALTH_CHECK_CRON', errors);
  validateProductionSafety(normalized, errors);

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n- ${errors.join('\n- ')}`);
  }

  for (const [key, value] of Object.entries(normalized)) {
    if (typeof value === 'string') {
      process.env[key] = value;
    }
  }

  return normalized;
}

function validateOrigins(config: EnvConfig, key: string, errors: string[]): void {
  const value = String(config[key]);
  const origins = value.split(',').map((origin) => origin.trim());
  if (origins.length === 0 || origins.some((origin) => origin.length === 0)) {
    errors.push(`${key} must contain one or more origins`);
    return;
  }

  for (const origin of origins) {
    try {
      const parsed = new URL(origin);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        errors.push(`${key} origin must use http or https: ${origin}`);
      }
    } catch {
      errors.push(`${key} contains invalid origin: ${origin}`);
    }
  }
}

function setDefault(config: EnvConfig, key: string, value: string): void {
  if (config[key] === undefined || config[key] === null || config[key] === '') {
    config[key] = value;
  }
}

function requireString(config: EnvConfig, key: string, errors: string[]): void {
  const value = config[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${key} is required`);
    return;
  }

  config[key] = value.trim();
}

function validateInteger(
  config: EnvConfig,
  key: string,
  errors: string[],
  options: { min?: number; max?: number } = {},
): void {
  const value = Number(config[key]);
  if (!Number.isInteger(value)) {
    errors.push(`${key} must be an integer`);
    return;
  }

  if (options.min !== undefined && value < options.min) {
    errors.push(`${key} must be >= ${options.min}`);
  }
  if (options.max !== undefined && value > options.max) {
    errors.push(`${key} must be <= ${options.max}`);
  }

  config[key] = String(value);
}

function validateBoolean(
  config: EnvConfig,
  key: string,
  errors: string[],
): void {
  const value = String(config[key]).toLowerCase();
  if (value !== 'true' && value !== 'false') {
    errors.push(`${key} must be true or false`);
    return;
  }

  config[key] = value;
}

function validateEnum(
  config: EnvConfig,
  key: string,
  allowed: string[],
  errors: string[],
): void {
  const value = String(config[key]).toLowerCase();
  if (!allowed.includes(value)) {
    errors.push(`${key} must be one of: ${allowed.join(', ')}`);
    return;
  }

  config[key] = value;
}

function validateCron(config: EnvConfig, key: string, errors: string[]): void {
  const value = String(config[key]).trim();
  if (value.split(/\s+/).length !== 5) {
    errors.push(`${key} must be a 5-field cron expression`);
  }
}

function validateProductionSafety(config: EnvConfig, errors: string[]): void {
  if (config.NODE_ENV !== 'production') {
    return;
  }

  if (config.DB_SYNCHRONIZE === 'true') {
    errors.push('DB_SYNCHRONIZE must be false in production');
  }

  for (const [key, dangerousValues] of DANGEROUS_PRODUCTION_DEFAULTS) {
    const value = String(config[key] ?? '');
    if (dangerousValues.includes(value)) {
      errors.push(`${key} must not use the default development value in production`);
    }
  }

  if (
    config.VPN_PROVIDER !== 'noop' &&
    config.VPN_3XUI_TLS_REJECT_UNAUTHORIZED === 'false'
  ) {
    errors.push(
      'VPN_3XUI_TLS_REJECT_UNAUTHORIZED=false is not allowed with real VPN provider in production',
    );
  }
}
