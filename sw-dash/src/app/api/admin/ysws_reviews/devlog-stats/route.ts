import { NextResponse } from 'next/server'
import { yswsApi } from '@/lib/api'
import { prisma } from '@/lib/db'

interface Decision {
  ftDevlogId: string
  status: string
  approvedMins: number | null
  notes: string | null
}

export const GET = yswsApi(async (req) => {
  const params = req.nextUrl.searchParams
  const status = params.get('status') || 'done' // default to only completed reviews

  // Build the where clause
  const where: { status?: string; reviewerId?: { not: null } } = {
    reviewerId: { not: null }, // only reviews that have a reviewer
  }

  if (status && status !== 'all') {
    where.status = status
  }

  // Fetch all reviews with their reviewers and decisions
  const reviews = await prisma.yswsReview.findMany({
    where,
    select: {
      id: true,
      reviewerId: true,
      decisions: true,
      status: true,
      reviewer: {
        select: {
          id: true,
          username: true,
          avatar: true,
        },
      },
    },
  })

  // Map to count devlogs per reviewer
  const reviewerStats = new Map<
    number,
    {
      username: string
      avatar: string | null
      devlogCount: number
      approvedCount: number
      rejectedCount: number
      reviewCount: number
    }
  >()

  for (const review of reviews) {
    if (!review.reviewerId || !review.reviewer) continue

    const decisions = (review.decisions as Decision[] | null) || []
    const approvedDevlogs = decisions.filter((d) => d.status === 'approved').length
    const rejectedDevlogs = decisions.filter((d) => d.status === 'rejected').length
    const totalDevlogs = decisions.length

    if (!reviewerStats.has(review.reviewerId)) {
      reviewerStats.set(review.reviewerId, {
        username: review.reviewer.username,
        avatar: review.reviewer.avatar,
        devlogCount: 0,
        approvedCount: 0,
        rejectedCount: 0,
        reviewCount: 0,
      })
    }

    const stats = reviewerStats.get(review.reviewerId)!
    stats.devlogCount += totalDevlogs
    stats.approvedCount += approvedDevlogs
    stats.rejectedCount += rejectedDevlogs
    stats.reviewCount += 1
  }

  // Convert to array and sort by devlog count
  const leaderboard = Array.from(reviewerStats.entries())
    .map(([id, stats]) => ({
      reviewerId: id,
      username: stats.username,
      avatar: stats.avatar,
      devlogCount: stats.devlogCount,
      approvedCount: stats.approvedCount,
      rejectedCount: stats.rejectedCount,
      reviewCount: stats.reviewCount,
    }))
    .sort((a, b) => b.devlogCount - a.devlogCount)

  return NextResponse.json({
    leaderboard,
    total: leaderboard.reduce((sum, r) => sum + r.devlogCount, 0),
  })
})
