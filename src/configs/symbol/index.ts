export type SymbolCategoryKey = 'emoji' | 'letter' | 'number' | 'math' | 'arrow' | 'graph';
export type EmojiTypeKey = 'expression' | 'action' | 'faunaFlora' | 'food' | 'travel' | 'activity' | 'objects' | 'symbols';
export const SYMBOL_CATEGORY_KEYS: readonly SymbolCategoryKey[] = ['emoji', 'letter', 'number', 'math', 'arrow', 'graph'];
export const EMOJI_TYPE_KEYS: readonly EmojiTypeKey[] = ['expression', 'action', 'faunaFlora', 'food', 'travel', 'activity', 'objects', 'symbols'];
export const EMOJI_TYPE_ICONS: Record<EmojiTypeKey, string> = {
  expression: '😀',
  action: '👋',
  faunaFlora: '🐱',
  food: '🍕',
  travel: '✈️',
  activity: '⚽',
  objects: '💡',
  symbols: '🔣'
};
const DEFAULT_EMOJI_TYPE: EmojiTypeKey = 'expression';
const categoryLoaders: Record<Exclude<SymbolCategoryKey, 'emoji'>, () => Promise<{
  default: string[][];
}>> = {
  letter: () => import('./letter'),
  number: () => import('./number'),
  math: () => import('./math'),
  arrow: () => import('./arrow'),
  graph: () => import('./graph')
};
const emojiLoaders: Record<EmojiTypeKey, () => Promise<{
  default: string[];
}>> = {
  expression: () => import('./emoji/expression'),
  action: () => import('./emoji/action'),
  faunaFlora: () => import('./emoji/faunaFlora'),
  food: () => import('./emoji/food'),
  travel: () => import('./emoji/travel'),
  activity: () => import('./emoji/activity'),
  objects: () => import('./emoji/objects'),
  symbols: () => import('./emoji/symbols')
};
const cache = new Map<string, string[]>();
const inflight = new Map<string, Promise<string[]>>();
const toCacheKey = (category: SymbolCategoryKey, emojiType: EmojiTypeKey) => {
  return category === 'emoji' ? `emoji:${emojiType}` : category;
};
export const getCachedSymbolItems = (category: SymbolCategoryKey, emojiType: EmojiTypeKey = DEFAULT_EMOJI_TYPE): string[] | undefined => {
  return cache.get(toCacheKey(category, emojiType));
};
export const loadSymbolItems = (category: SymbolCategoryKey, emojiType: EmojiTypeKey = DEFAULT_EMOJI_TYPE): Promise<string[]> => {
  const key = toCacheKey(category, emojiType);
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(key);
  if (pending) return pending;
  const promise = (async () => {
    try {
      const items = category === 'emoji' ? (await emojiLoaders[emojiType]()).default : (await categoryLoaders[category]()).default.flat();
      cache.set(key, items);
      return items;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
};
export const prefetchSymbolItems = (category: SymbolCategoryKey, emojiType: EmojiTypeKey = DEFAULT_EMOJI_TYPE) => {
  void loadSymbolItems(category, emojiType);
};
void loadSymbolItems('emoji', DEFAULT_EMOJI_TYPE);
