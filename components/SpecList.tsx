import type { RuleRow } from "@/lib/strategy";

import s from "./SpecList.module.css";

/** Strategy rules as a quiet two-column list: the label in the body face, the value in mono. */
export function SpecList({ rows, compact }: { rows: RuleRow[]; compact?: boolean }) {
  return (
    <dl className={s.list} data-compact={compact || undefined}>
      {rows.map(([label, value, tone]) => (
        <div key={label} className={s.row}>
          <dt>{label}</dt>
          <dd className={tone}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
