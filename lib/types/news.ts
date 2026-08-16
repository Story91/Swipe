/**
 * Normalised news item served by /api/news.
 *
 * The shape is deliberately provider-agnostic: the upstream provider's field
 * names are mapped in the route handler, so swapping providers does not touch
 * any client component.
 */
export interface NewsItem {
  title: string;
  description: string;
  url: string;
  source: string;
  /** ISO 8601 */
  publishedAt: string;
  imageUrl?: string;
  categories?: string;
}
