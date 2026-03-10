# D1 Migrations

Apply the initial schema locally:

```bash
npx wrangler d1 execute smartclass --local --file worker/db/migrations/0001_init.sql
```

Apply the initial schema to Cloudflare D1:

```bash
npx wrangler d1 execute smartclass --remote --file worker/db/migrations/0001_init.sql
```

If your database name is different, replace `smartclass` with your D1 database name.

Apply bootstrap teacher seed locally:

```bash
npx wrangler d1 execute smartclass --local --file worker/db/seeds/0001_seed_teacher.sql
```

Apply bootstrap teacher seed remotely:

```bash
npx wrangler d1 execute smartclass --remote --file worker/db/seeds/0001_seed_teacher.sql
```
