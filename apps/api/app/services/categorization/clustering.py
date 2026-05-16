# MoniMata - zero-based budgeting for Nigerians
# Copyright (C) 2026  MoniMata Contributors
#
# SPDX-License-Identifier: AGPL-3.0-or-later

"""Levenshtein clustering for the cold-start onboarding UX (Phase 6).

Algorithm
---------
1. The caller pre-aggregates unique cleaned_narration strings from the DB via
   GROUP BY — compressing O(N) transaction rows to O(K) unique narrations where
   K << N.
2. Narrations are sorted by frequency (most common first) so the cluster
   representative is always the most-seen narration in the group.
3. A greedy single-pass assigns each narration to the first cluster whose key
   is within the normalised Levenshtein distance threshold.  O(K²) in the
   worst case but fast in practice because K rarely exceeds a few hundred.

Tuning
------
_THRESHOLD = 0.30 means two narrations are merged when ≥70 % of their
characters match.  Lower values produce tighter (more) clusters.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from rapidfuzz.distance import Levenshtein

_THRESHOLD = 0.30  # normalised Levenshtein distance ceiling for cluster membership


@dataclass
class NarrationCluster:
    key: str  # representative narration (highest frequency in group)
    member_narrations: list[str] = field(default_factory=list)
    count: int = 0  # total transaction count across all members
    total_amount: int = 0  # sum of ABS(amount) in kobo across all members


def build_clusters(rows: list[tuple[str, int, int]]) -> list[NarrationCluster]:
    """Cluster unique narrations by Levenshtein similarity.

    Parameters
    ----------
    rows:
        Iterable of (cleaned_narration, tx_count, total_abs_amount) tuples
        produced by the GROUP BY query.

    Returns
    -------
    List of NarrationCluster objects sorted by ``count`` descending.
    """
    # Sort by count desc so the cluster representative is the most frequent narration.
    sorted_rows = sorted(rows, key=lambda x: x[1], reverse=True)

    assigned: set[str] = set()
    clusters: list[NarrationCluster] = []

    for narration, count, total in sorted_rows:
        if narration in assigned:
            continue

        cluster = NarrationCluster(
            key=narration,
            member_narrations=[narration],
            count=count,
            total_amount=total,
        )
        assigned.add(narration)

        for other, other_count, other_total in sorted_rows:
            if other in assigned:
                continue
            if Levenshtein.normalized_distance(narration, other) <= _THRESHOLD:
                cluster.member_narrations.append(other)
                cluster.count += other_count
                cluster.total_amount += other_total
                assigned.add(other)

        clusters.append(cluster)

    clusters.sort(key=lambda c: c.count, reverse=True)
    return clusters


def find_cluster_members(cluster_key: str, all_narrations: list[str]) -> list[str]:
    """Return all narrations within threshold distance of cluster_key.

    Used by POST /clusters/categorize to find which transactions to update
    without re-running the full clustering pass.
    """
    return [
        n
        for n in all_narrations
        if n == cluster_key or Levenshtein.normalized_distance(cluster_key, n) <= _THRESHOLD
    ]
