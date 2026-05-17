export interface DefaultCategoryDefinition {
  slug: string;
  name: string;
}

export const DEFAULT_CATEGORIES: DefaultCategoryDefinition[] = [
  { slug: 'groceries', name: 'Groceries' },
  { slug: 'restaurants', name: 'Restaurants' },
  { slug: 'transport', name: 'Transport' },
  { slug: 'shopping', name: 'Shopping' },
  { slug: 'bills', name: 'Bills' },
  { slug: 'entertainment', name: 'Entertainment' },
  { slug: 'health', name: 'Health' },
  { slug: 'travel', name: 'Travel' },
  { slug: 'education', name: 'Education' },
  { slug: 'income', name: 'Income' },
  { slug: 'transfer', name: 'Transfer' },
  { slug: 'cash-withdrawal', name: 'Cash Withdrawal' },
];

export function normalizeCategorySlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
