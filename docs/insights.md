# Contextual insights (M9.3)

`GET /api/v1/insights` requires the authenticated session and returns an on-demand, user-scoped `{ "insights": [...] }` response. Each item has a stable ID, enum-like `type` and `category`, priority, plain-text title/description, optional internal `href`, and structured numeric `data`. For example:

```json
{
  "insights": [
    {
      "id": "milestone-near-12",
      "type": "milestone_near",
      "category": "milestone",
      "priority": 90,
      "title": "The finish line is in sight!",
      "description": "You've reached 94% of your milestone. 150 unique beer discoveries remain.",
      "href": "/milestones/12",
      "data": {"milestone_id": 12, "current": 2350, "target": 2500, "remaining": 150, "progress_percent": 94.0}
    }
  ]
}
```

Milestone candidates use M9.1's calculated status, counts, completion timestamp, and trajectory difference; progress is never independently reconstructed here. Recently completed means completion on one of the last 14 local dates including today, using the milestone's configured timezone. The endpoint excludes archived milestones. Near completion requires active status, at least 90% progress, and remaining qualifying events. Ahead/below-trajectory observations use M9.1's non-null trajectory difference and require an absolute deviation of at least five events and at least five percent of the target. Overdue observations report the current state, not a repeated deadline event; progress can continue after the deadline.

Activity comparisons use `Europe/Amsterdam`. Month-to-date check-ins and first-ever canonical beer discoveries are compared with the previous month from local midnight on day one through the equivalent local date and wall-clock time. If that day does not exist in the previous month, its last date is used (for example, March 31 compares through February 28, or February 29 in a leap year). Boundaries are converted to UTC; events are included through the evaluation timestamp and later events are excluded. DST changes therefore alter UTC boundary offsets without shifting local reporting dates. Discoveries use the same `beer_id` identity and `(occurred_at_utc, check-in ID)` first-event tie-break as analytics. Repeats count for check-in trends but never as discoveries.

A trend requires at least 10 qualifying events in each period, a nonzero previous-period baseline, an absolute difference of at least five, and a difference of at least 20% of the previous count. Increases and decreases are factual comparisons only; they do not imply causes or recommend changing drinking behavior. Results are deterministically ranked: recent completions, near completion, ahead, below, discovery trend, check-in trend, then overdue. At most two milestone and two activity insights (and five overall) are returned, with at most one selected insight per milestone. Empty or weakly evidenced candidate sets can yield an empty list.

Insights are recalculated from current imported check-ins and milestone definitions for every request. Imports, edits, corrections, and deletions can therefore change or remove prior observations. No generated insight is persisted; there are no dismissal states, jobs, external calls, or forecasts.
