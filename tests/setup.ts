process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/researchflow_test";
process.env.AUTH_SECRET ??= "test-auth-secret-do-not-use-in-production";
