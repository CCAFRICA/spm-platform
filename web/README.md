This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Build-time Korean Test gate (HF-195)

`npm run build` runs a `prebuild` hook (`scripts/verify-korean-test.sh`) that scans `src/` for quoted string literals of legacy primitive names (`matrix_lookup`, `tiered_lookup`, `tier_lookup`, `flat_percentage`, `conditional_percentage`). The gate excludes the canonical surface (`primitive-registry.ts`).

What triggers the gate:
- Adding a new file that contains a quoted legacy primitive-name literal anywhere in `src/`
- Re-introducing a parallel hardcoded vocabulary in any prompt content, display label, or dispatch table

Why: HF-195 Rule 27 (T5 standing rule) mandates that componentType vocabulary derive from the canonical `PrimitiveEntry` registry, not from private hardcoded copies. The gate enforces this at build time so that drift can't ship.

Manual run: `npm run korean-test`.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
