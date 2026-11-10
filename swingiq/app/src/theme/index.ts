// SwingIQ Design System
// All colours, typography, and spacing in one place.
// Import from any screen: import { Colors, Typography, Spacing } from '@/theme'

export const Colors = {
  // Brand greens
  green:      '#1a6b3a',
  greenMid:   '#2d8a50',
  greenLight: '#e8f5ed',
  greenGlow:  '#6dcf8e',

  // Gold accents (challenges, achievements)
  gold:       '#c9a227',
  goldLight:  '#fdf6e3',
  goldBright: '#e8c04a',

  // Dark surfaces (hero areas, camera UI)
  dark:       '#0f1a12',
  darkMid:    '#1a2d1e',
  darkCard:   '#0f2d1a',

  // Neutral
  background: '#f4f8f5',
  surface:    '#ffffff',
  border:     'rgba(26,107,58,0.15)',
  borderDark: 'rgba(109,207,142,0.2)',

  // Text
  textPrimary:   '#1a2418',
  textSecondary: '#5a6b5e',
  textMuted:     '#8a9a8e',
  textOnDark:    '#ffffff',
  textOnDarkDim: 'rgba(255,255,255,0.55)',

  // Severity (feedback items)
  severityFix:     '#d04040',
  severityFixBg:   'rgba(208,64,64,0.1)',
  severityImprove: '#e8a030',
  severityImproveBg: 'rgba(232,160,48,0.1)',
  severityGood:    '#2d8a50',
  severityGoodBg:  'rgba(45,138,80,0.1)',

  // Transparent overlays
  overlay20: 'rgba(0,0,0,0.2)',
  overlay50: 'rgba(0,0,0,0.5)',
  overlay70: 'rgba(0,0,0,0.7)',
} as const;

export const Typography = {
  // Font sizes
  xs:   11,
  sm:   12,
  base: 14,
  md:   16,
  lg:   18,
  xl:   22,
  xxl:  28,
  hero: 34,

  // Weights
  regular:   '400' as const,
  medium:    '500' as const,
  semibold:  '600' as const,
  bold:      '700' as const,

  // Line heights
  tight:   1.2,
  normal:  1.5,
  relaxed: 1.7,
} as const;

export const Spacing = {
  xs:   4,
  sm:   8,
  md:  12,
  lg:  16,
  xl:  24,
  xxl: 32,
  xxxl:48,
} as const;

export const Radius = {
  sm:   8,
  md:  12,
  lg:  16,
  xl:  24,
  full: 999,
} as const;

export const Shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;
