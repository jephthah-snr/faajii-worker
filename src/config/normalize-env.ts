function firstDefined(...values: Array<string | undefined>): string | undefined {
  return values.find(value => value !== undefined && value !== '');
}

function buildRedisUrl(env: NodeJS.ProcessEnv): string | undefined {
  if (env.REDIS_URL) return env.REDIS_URL;
  const host = env.REDIS_HOST;
  if (!host) return undefined;
  const port = env.REDIS_PORT || '6379';
  const username = env.REDIS_USERNAME;
  const password = env.REDIS_PASSWORD;
  if (username || password) {
    const user = encodeURIComponent(username || '');
    const pass = encodeURIComponent(password || '');
    return `redis://${user}:${pass}@${host}:${port}`;
  }
  return `redis://${host}:${port}`;
}

function parseMailFrom(raw: string | undefined): { address?: string; name?: string } {
  if (!raw) return {};
  const angle = raw.match(/^(?:"?([^"]*)"?\s*)?<([^>]+)>$/);
  const address = angle?.[2]?.trim();
  if (address) {
    return {
      name: angle?.[1]?.trim() || undefined,
      address,
    };
  }
  const email = raw.trim().replace(/^["']|["']$/g, '');
  return { address: email };
}

function normalizeMailApiUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.replace(/\/$/, '');
  if (trimmed.endsWith('/email')) return trimmed;
  return `${trimmed}/email`;
}

/** Map core-backend env names onto the worker's expected keys. */
export function normalizeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const mailFrom = parseMailFrom(env.MAILER_FROM);
  const redisUrl = buildRedisUrl(env);
  const mailApiUrl = firstDefined(env.MAIL_API_URL, normalizeMailApiUrl(env.MAILER_SMTP_HOST));
  const mailApiToken = firstDefined(env.MAIL_API_TOKEN, env.MAILER_PASSWORD);
  const mailFromAddress = firstDefined(env.MAIL_FROM_ADDRESS, mailFrom.address, env.MAILER_USERNAME);
  const mailFromName = firstDefined(env.MAIL_FROM_NAME, env.MAILER_FROM_NAME, mailFrom.name);
  const smsApiUrl = firstDefined(env.SMS_API_URL, env.TERMII_BASE_URL);
  const smsApiKey = firstDefined(env.SMS_API_KEY, env.TERMII_API_KEY);
  const smsSenderId = firstDefined(env.SMS_SENDER_ID, env.TERMII_SENDER_ID);
  const smsAllowed = (() => {
    if (env.SMS_ALLOWED_COUNTRY_CODES) return env.SMS_ALLOWED_COUNTRY_CODES;
    if (!env.DEFAULT_PHONE_COUNTRY_CODE) return undefined;
    return [...new Set([env.DEFAULT_PHONE_COUNTRY_CODE, '234', '229', '225', '221', '228', '227'])].join(',');
  })();

  return {
    ...env,
    ...(redisUrl ? { REDIS_URL: redisUrl } : {}),
    ...(mailApiUrl ? { MAIL_API_URL: mailApiUrl } : {}),
    ...(mailApiToken !== undefined ? { MAIL_API_TOKEN: mailApiToken } : {}),
    ...(mailFromAddress ? { MAIL_FROM_ADDRESS: mailFromAddress } : {}),
    ...(mailFromName ? { MAIL_FROM_NAME: mailFromName } : {}),
    ...(smsApiUrl ? { SMS_API_URL: smsApiUrl } : {}),
    ...(smsApiKey !== undefined ? { SMS_API_KEY: smsApiKey } : {}),
    ...(smsSenderId ? { SMS_SENDER_ID: smsSenderId } : {}),
    ...(smsAllowed ? { SMS_ALLOWED_COUNTRY_CODES: smsAllowed } : {}),
  };
}
