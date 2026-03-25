// MoniMata - zero-based budgeting for Nigerians
// Copyright (C) 2026  MoniMata Contributors
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * components/ui/index.ts
 *
 * Barrel export for all shared UI primitives.
 * Import from '@/components/ui' in screen files.
 *
 * @example
 *   import { Button, Card, AmountDisplay, ProgressBar } from '@/components/ui';
 */

export { Button } from './Button';
export type { ButtonProps, ButtonVariant } from './Button';

export { Card, CardRow } from './Card';
export type { CardProps } from './Card';

export { Badge } from './Badge';
export type { BadgeProps, BadgeSize, BadgeVariant } from './Badge';

export { Input } from './Input';
export type { InputProps } from './Input';

export { BottomSheet } from './BottomSheet';
export type { BottomSheetProps } from './BottomSheet';

export { SectionHeader } from './SectionHeader';
export type { SectionHeaderProps } from './SectionHeader';

export { Avatar } from './Avatar';
export type { AvatarProps, AvatarSize } from './Avatar';

export { ProgressBar } from './ProgressBar';
export type { ProgressBarProps, ProgressBarSize, ProgressBarState } from './ProgressBar';

export { AmountDisplay } from './AmountDisplay';
export type { AmountDisplayProps, AmountSize } from './AmountDisplay';

export { ListRow } from './ListRow';
export type { ListRowProps } from './ListRow';

export { Chip } from './Chip';
export type { ChipProps } from './Chip';

export { Divider } from './Divider';
export type { DividerProps } from './Divider';

export { EmptyState } from './EmptyState';
export type { EmptyStateAction, EmptyStateProps } from './EmptyState';

export { MainTabBar } from './TabBar';

