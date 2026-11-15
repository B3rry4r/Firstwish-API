/**
 * The environment every test runs with: stand-in providers, local Postgres and Redis.
 * DATABASE_URL and REDIS_URL come from the test runner (scripts/test-runner.mjs), which makes a fresh database per run.
 */
export function standinEnv(): Record<string, string> {
  return {
    NODE_ENV: "test",
    PROVIDERS: "standin",
    DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://firstwish:firstwish@127.0.0.1:5432/fw_test_unset",
    REDIS_URL: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
    JWT_ACCESS_SECRET: "test-access-secret-0123456789abcdef0123",
    REFRESH_TOKEN_PEPPER: "test-refresh-pepper-0123456789abcdef012",
    INTERNAL_TOKEN: "test-internal-token-0123456789abcdef01",
    AUTH_CODE_PEPPER: "test-code-pepper-0123456789abcdef0123456",
    COOKIE_DOMAIN: "localhost",
    WEB_ORIGINS: "http://localhost:3000",
    PUBLIC_SITE_URL: "http://localhost:3000",
    API_PUBLIC_URL: "http://localhost:4000",
    MAIL_FROM: "wishes@example.test",
    // Tests send X-Forwarded-For as if one proxy stood in front (V4); a spec that proves 0 sets it itself.
    TRUST_PROXY_HOPS: "1",
  };
}
