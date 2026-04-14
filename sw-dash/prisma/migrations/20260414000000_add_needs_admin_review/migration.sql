-- AlterTable
ALTER TABLE `ship_certs`
  ADD COLUMN `needsAdminReview` BOOLEAN NOT NULL DEFAULT false;

-- Backfill: flag existing reship rows that don't have a valid prior approval.
-- Mirrors the webhook-time detection: a reship is anomalous if the most recent
-- prior cert for the same ftProjectId is missing, rejected, or in any state
-- other than "approved" / "pending with yswsReturnedAt set".
UPDATE `ship_certs` r
SET r.`needsAdminReview` = TRUE
WHERE r.`ftType` = 'reship'
  AND (
    r.`ftProjectId` IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM `ship_certs` p
      WHERE p.`ftProjectId` = r.`ftProjectId`
        AND p.`id` != r.`id`
        AND p.`createdAt` = (
          SELECT MAX(p2.`createdAt`)
          FROM `ship_certs` p2
          WHERE p2.`ftProjectId` = r.`ftProjectId`
            AND p2.`id` != r.`id`
        )
        AND (
          p.`status` = 'approved'
          OR (p.`status` = 'pending' AND p.`yswsReturnedAt` IS NOT NULL)
        )
    )
  );
