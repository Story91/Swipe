/**
 * A pass-through. The metadata for this route lives in page.tsx.
 *
 * This file held a generateMetadata that read Redis with a hardcoded 'base' and
 * built its og:image and frame url with no chain on either. Both deployments
 * number their markets from 1, so a Robinhood market's record lives under
 * `robinhood:prediction:pred_v4_N`, the Base lookup missed it, and every
 * Robinhood share fell back to the generic card with no question on it.
 *
 * It cannot be fixed here. A layout's generateMetadata is handed `params` and
 * nothing else, so it can never see `?chain=`. That is why the page was split
 * into a server component plus PredictionPageClient: a page's generateMetadata
 * does get searchParams. The same split is documented at length in
 * app/pnl/[address]/layout.tsx, which hit this first.
 *
 * The file stays rather than being deleted because it has now been deleted and
 * restored twice by two people working in parallel, each reading its absence as
 * the missing link previews. The previews are in page.tsx and they carry the
 * chain. Nothing needs to be restored here.
 */
export default function PredictionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
