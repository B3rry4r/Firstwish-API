# The owner page: what each section shows

Short labels, numbers and pictures. No paragraphs. Use the project's own design tokens if it has a design system; otherwise a clean dark-first page with one accent colour. Light and dark themes both.

1. **The answer** (top, three big figures): expected cost in local currency and dollars (light and heavy small under it), duration in days (dynamic, with what binds it), plans needed. One line under each, no more.
2. **The count**: features in the sources, tasks they became, owner items. Chips for sizes (S, M, L) and tiers (T0, T1, T2).
3. **By area**: one horizontal bar per area, length by cost, label with task count and dollars. Sorted by cost.
4. **Timeline**: weeks across, areas down; each area a bar from its first to last task; the critical path drawn in the accent colour; owner waits as hatched bars.
5. **Budget**: three columns, light / expected / heavy, rows for API dollars, plan-weeks, subscription cost (dollars and local), pay-as-you-go (local). Mark measured vs assumed constants with a small dot.
6. **Fixed date** (only if a date was asked): plans needed, feasible yes or no, and the one reason when not (critical path, throughput, an owner wait).
7. **Only you**: owner items as cards with their wait in days and the task they unblock. Title: "Money can't buy these".
8. **Decisions**: each as a card with the question, the recommended default marked, and a tag if it moves the cost.
9. **All tasks**: a compact table (id, area, title, size, tier, depends on), collapsed by default, filterable by area.

Attach `tasks.csv` and `plan-data.json` beside the page. Keep every number on the page coming from plan-data.json so a re-run updates the page.
