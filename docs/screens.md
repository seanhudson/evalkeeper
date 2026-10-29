# Make the screens your own

The screens come from the package, so they upgrade with it. You can
still make them look like your app, and rearrange or add to any page,
without copying them.

There are three ways, from least to most work:

| Way                                             | What changes                                     | Still upgrades?            |
| ----------------------------------------------- | ------------------------------------------------ | -------------------------- |
| [Look like your app](#look-like-your-app)       | The buttons, cards, and controls the screens use | Yes                        |
| [Arrange your own page](#arrange-your-own-page) | Which sections a page shows, and in what order   | Yes: the sections still do |
| [Copy a page](#copy-a-page-as-a-last-resort)    | Everything on that page                          | No: you keep it in step    |

## Look like your app

Your team spends time in these screens. Using your own components makes
them feel like part of your app, not a bolted-on tool.

**Do this**

Name your app's own components in `lib/evalkeeper/appComponents.tsx`.
The eval pages' layout wraps it around every page, and the screens use
yours. Leave one out to keep Evalkeeper's:

```tsx
"use client";
import { EvalComponentsProvider } from "@crowandraven/evalkeeper/react";
import { nextComponents } from "@crowandraven/evalkeeper/next/components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function AppComponents({ children }: { children: React.ReactNode }) {
  return (
    <EvalComponentsProvider components={{ ...nextComponents, Button, Card }}>
      {children}
    </EvalComponentsProvider>
  );
}
```

**Check it works:** open the eval hub. Its buttons and cards look like
the rest of your app.

### The pieces you can replace

The screens are drawn from a few pieces in
`@crowandraven/evalkeeper/react`:

- `Card`
- `Chip`
- `Link`
- `BackLink`
- `Score`
- `Submit`
- `IconSubmit`
- `Spinner`
- `Tip`
- `InfoTip`
- the plain controls: `Button`, `TextInput`, `TextArea`, and `Select`

### Rules for your components

- Each gets the props Evalkeeper's own would. `EvalComponents` has the
  types.
- Those props include Evalkeeper's `className`, which yours can use or
  ignore.
- Your components must be client components.
- Controls must still render the native element, or pass `name` and the
  value to one, so forms submit.

### What `nextComponents` gives you

`nextComponents` has two things:

- Next.js's `Link`, so moving between eval pages doesn't reload.
- A `RefreshWhile` on its router, so a page refreshes while a test runs.

In another React app, pass your router's own.

## Arrange your own page

You may want another layout, or a section of your own beside
Evalkeeper's. You can have both and still get upgrades, because the
sections come from the package.

**Do this**

Replace the route file with your own arrangement:

```tsx
// app/admin/evals/[suite]/page.tsx
import { notFound } from "next/navigation";
import {
  ModelTable,
  SuiteHeader,
  RefreshWhile,
  loadSuitePage,
} from "@crowandraven/evalkeeper/react";
import { requireAdmin } from "@/lib/evalkeeper";
import { evals } from "@/lib/evalkeeper/evals";
import { OurNotes } from "@/components/OurNotes";

export const dynamic = "force-dynamic";

export default async function SuitePage({
  params,
}: {
  params: Promise<{ suite: string }>;
}) {
  await requireAdmin();
  const data = await loadSuitePage(evals, (await params).suite);
  if (!data) notFound();
  return (
    <div className="space-y-8">
      <RefreshWhile active={data.testing} />
      <SuiteHeader data={data} />
      <OurNotes suite={data.key} />
      <ModelTable data={data} />
    </div>
  );
}
```

**Check it works:** open a suite's page. It shows your sections in your
order.

### How a page is put together

Each page is a short arrangement of sections from
`@crowandraven/evalkeeper/react`. The sections hold all the logic. They
read everything from one object, `evals` in `lib/evalkeeper/evals.ts`.

| Page                | Loads its data with               | Sections, in order                                                                                                                                                                                                 |
| ------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Suite (`SuitePage`) | `loadSuitePage(evals, key)`, once | `SuiteHeader`, `ChosenOnBase`, `SuggestionCard`, `CasesInInstructions`, `ModelTable`, `TestSettingSection`, `CheckBreakdownSection`, `Versions`, `ChecksSection`, `AnswerKeyHealthSection`, and `AnswerKeySection` |
| Hub (`HubPage`)     | `loadHub(evals)`                  | `HubIntro`, `HubStats`, `WeeklyCheck`, and `SuiteList`                                                                                                                                                             |

The other pages are one view each:

- `RunView`
- `CompareView`
- `SideBySideView`
- `RateView`
- `FeedbackView`

## Copy a page as a last resort

For total control, `add pages --only` copies a page into your app (see
[Your own pages](bring-your-own.md#your-own-pages)).

A copied page no longer upgrades: you keep it in step yourself.
