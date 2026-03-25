import type { Profile } from './database.types';

export type ProfileColorName =
  | 'blue'
  | 'green'
  | 'red'
  | 'orange'
  | 'purple'
  | 'pink'
  | 'yellow'
  | 'teal'
  | 'indigo'
  | 'slate';

type Variant = 'solid' | 'soft' | 'tile' | 'text';

type ColorClasses = {
  solid: string;
  soft: string;
  tile: string;
  text: string;
};

const MAP: Record<ProfileColorName, ColorClasses> = {
  blue: {
    solid: 'bg-gradient-to-br from-blue-500 to-blue-600 text-white',
    soft: 'bg-blue-50/70 hover:bg-blue-50/85 dark:bg-blue-950/30 dark:hover:bg-blue-950/40',
    tile: 'bg-blue-50/70 hover:bg-blue-50/85 dark:bg-blue-950/30 dark:hover:bg-blue-950/40',
    text: 'text-blue-700 dark:text-blue-200'
  },
  green: {
    solid: 'bg-gradient-to-br from-green-500 to-green-600 text-white',
    soft: 'bg-green-50/70 hover:bg-green-50/85 dark:bg-green-950/30 dark:hover:bg-green-950/40',
    tile: 'bg-green-50/70 hover:bg-green-50/85 dark:bg-green-950/30 dark:hover:bg-green-950/40',
    text: 'text-green-700 dark:text-green-200'
  },
  red: {
    solid: 'bg-gradient-to-br from-red-500 to-red-600 text-white',
    soft: 'bg-red-50/70 hover:bg-red-50/85 dark:bg-red-950/30 dark:hover:bg-red-950/40',
    tile: 'bg-red-50/70 hover:bg-red-50/85 dark:bg-red-950/30 dark:hover:bg-red-950/40',
    text: 'text-red-700 dark:text-red-200'
  },
  orange: {
    solid: 'bg-gradient-to-br from-orange-500 to-orange-600 text-white',
    soft: 'bg-orange-50/70 hover:bg-orange-50/85 dark:bg-orange-950/30 dark:hover:bg-orange-950/40',
    tile: 'bg-orange-50/70 hover:bg-orange-50/85 dark:bg-orange-950/30 dark:hover:bg-orange-950/40',
    text: 'text-orange-700 dark:text-orange-200'
  },
  purple: {
    solid: 'bg-gradient-to-br from-purple-500 to-purple-600 text-white',
    soft: 'bg-purple-50/70 hover:bg-purple-50/85 dark:bg-purple-950/30 dark:hover:bg-purple-950/40',
    tile: 'bg-purple-50/70 hover:bg-purple-50/85 dark:bg-purple-950/30 dark:hover:bg-purple-950/40',
    text: 'text-purple-700 dark:text-purple-200'
  },
  pink: {
    solid: 'bg-gradient-to-br from-pink-500 to-pink-600 text-white',
    soft: 'bg-pink-50/70 hover:bg-pink-50/85 dark:bg-pink-950/30 dark:hover:bg-pink-950/40',
    tile: 'bg-pink-50/70 hover:bg-pink-50/85 dark:bg-pink-950/30 dark:hover:bg-pink-950/40',
    text: 'text-pink-700 dark:text-pink-200'
  },
  yellow: {
    solid: 'bg-gradient-to-br from-yellow-500 to-yellow-600 text-white',
    soft: 'bg-yellow-50/70 hover:bg-yellow-50/85 dark:bg-yellow-950/30 dark:hover:bg-yellow-950/40',
    tile: 'bg-yellow-50/70 hover:bg-yellow-50/85 dark:bg-yellow-950/30 dark:hover:bg-yellow-950/40',
    text: 'text-yellow-700 dark:text-yellow-200'
  },
  teal: {
    solid: 'bg-gradient-to-br from-teal-500 to-teal-600 text-white',
    soft: 'bg-teal-50/70 hover:bg-teal-50/85 dark:bg-teal-950/30 dark:hover:bg-teal-950/40',
    tile: 'bg-teal-50/70 hover:bg-teal-50/85 dark:bg-teal-950/30 dark:hover:bg-teal-950/40',
    text: 'text-teal-700 dark:text-teal-200'
  },
  indigo: {
    solid: 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white',
    soft: 'bg-indigo-50/70 hover:bg-indigo-50/85 dark:bg-indigo-950/30 dark:hover:bg-indigo-950/40',
    tile: 'bg-indigo-50/70 hover:bg-indigo-50/85 dark:bg-indigo-950/30 dark:hover:bg-indigo-950/40',
    text: 'text-indigo-700 dark:text-indigo-200'
  },
  slate: {
    solid: 'bg-gradient-to-br from-slate-500 to-slate-600 text-white',
    soft: 'bg-slate-50/70 hover:bg-slate-50/85 dark:bg-slate-950/30 dark:hover:bg-slate-950/40',
    tile: 'bg-slate-50/70 hover:bg-slate-50/85 dark:bg-slate-950/30 dark:hover:bg-slate-950/40',
    text: 'text-slate-700 dark:text-slate-200'
  }
};

function normalizeColor(raw: unknown): ProfileColorName {
  const c = String(raw || '').trim().toLowerCase();
  if (c in MAP) return c as ProfileColorName;
  return 'blue';
}

export function profileColorClass(profileOrColor: Profile | string | undefined | null, variant: Variant): string {
  const color = typeof profileOrColor === 'string' ? profileOrColor : profileOrColor?.color;
  const norm = normalizeColor(color);
  return MAP[norm][variant];
}
