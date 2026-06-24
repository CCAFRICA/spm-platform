'use client';

/**
 * DS-003 §1.3 — NeighborhoodLeaderboard. Decision task: RANKING (relative, rep view). Shows the user's
 * neighbourhood — N rows above and below self — with self highlighted (persona accent) and movement
 * arrows (the reference frame). Does NOT show rank #1 unless self is in the neighbourhood (Social
 * Comparison Theory — large gaps demotivate).
 */

import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { usePersonaTheme } from './persona-theme';
import { directionColor, SECTION_LABEL_CLASS, TEXT } from './ds003-tokens';

export interface LeaderboardEntity {
  id: string;
  name: string;
  value: number;
  /** rank movement since last period (+up / -down). */
  move?: number | null;
}

export interface NeighborhoodLeaderboardProps {
  title?: string;
  entities: LeaderboardEntity[];
  selfId: string;
  neighborhoodSize?: number;
  format?: (n: number) => string;
  emptyLabel?: string;
}

export function NeighborhoodLeaderboard({
  title,
  entities,
  selfId,
  neighborhoodSize = 2,
  format,
  emptyLabel = 'No ranking available.',
}: NeighborhoodLeaderboardProps) {
  const theme = usePersonaTheme();
  const fmt = format ?? ((n: number) => n.toLocaleString());
  const ranked = [...entities].sort((a, b) => b.value - a.value).map((e, i) => ({ ...e, rank: i + 1 }));
  const selfIdx = ranked.findIndex((e) => e.id === selfId);

  if (ranked.length === 0) return <div className={`text-sm ${TEXT.muted}`}>{emptyLabel}</div>;

  // window around self; if self not found, show the top window.
  const center = selfIdx >= 0 ? selfIdx : 0;
  const start = Math.max(0, center - neighborhoodSize);
  const end = Math.min(ranked.length, center + neighborhoodSize + 1);
  const window = ranked.slice(start, end);

  return (
    <div>
      {title && <div className={`mb-2 ${SECTION_LABEL_CLASS}`}>{title}</div>}
      <div className="space-y-1">
        {window.map((e) => {
          const isSelf = e.id === selfId;
          const move = e.move ?? 0;
          const MoveIcon = move > 0 ? ArrowUp : move < 0 ? ArrowDown : Minus;
          const moveColor = directionColor(move > 0 ? 'up' : move < 0 ? 'down' : 'flat');
          return (
            <div
              key={e.id}
              className="flex items-center gap-3 rounded-lg px-3 py-2"
              style={
                isSelf
                  ? { backgroundColor: theme.accentSoft, boxShadow: `inset 0 0 0 1px ${theme.accentBorder}` }
                  : undefined
              }
            >
              <span className={`w-6 shrink-0 text-sm font-bold tabular-nums ${isSelf ? '' : TEXT.muted}`} style={isSelf ? { color: theme.accent } : undefined}>
                {e.rank}
              </span>
              <span className={`min-w-0 flex-1 truncate text-sm ${isSelf ? 'font-semibold text-foreground' : TEXT.body}`}>
                {e.name}{isSelf && <span className="ml-1.5 text-[10px] uppercase" style={{ color: theme.accent }}>You</span>}
              </span>
              <span className={`shrink-0 text-sm font-semibold tabular-nums ${isSelf ? 'text-foreground' : 'text-foreground'}`}>{fmt(e.value)}</span>
              <span className="flex w-9 shrink-0 items-center justify-end gap-0.5 text-xs tabular-nums" style={{ color: moveColor }}>
                {move !== 0 && <MoveIcon className="h-3 w-3" />}
                {move !== 0 ? Math.abs(move) : <Minus className="h-3 w-3 text-muted-foreground" />}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
