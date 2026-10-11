export type Urgency = "NORMAL" | "TIME_SENSITIVE" | "URGENT" | "EXPIRED" | "MANUAL_REVIEW";

export type SafetyRuleConfig = {
  urgentWithinMinutes: number;
  timeSensitiveWithinMinutes: number;
  requireStorageCondition: boolean;
  requirePackagingCondition: boolean;
};

export const defaultSafetyRules: SafetyRuleConfig = {
  urgentWithinMinutes: 60,
  timeSensitiveWithinMinutes: 180,
  requireStorageCondition: true,
  requirePackagingCondition: true,
};

export function classifyUrgency(input: {
  pickupDeadline: Date;
  storageCondition: string | null;
  packagingCondition: string | null;
  safetyReviewed: boolean;
  now?: Date;
  config?: Partial<SafetyRuleConfig>;
}): { urgency: Urgency; acceptingAllowed: boolean; reasons: string[]; remainingMinutes: number } {
  const now = input.now ?? new Date();
  const rules = { ...defaultSafetyRules, ...input.config };
  const remainingMinutes = Math.floor((input.pickupDeadline.getTime() - now.getTime()) / 60_000);
  const reasons: string[] = [];
  if (remainingMinutes <= 0) return { urgency: "EXPIRED", acceptingAllowed: false, reasons: ["Verified collection deadline has passed."], remainingMinutes };
  if (!input.safetyReviewed) reasons.push("Food safety conditions have not been manually reviewed.");
  if (rules.requireStorageCondition && !input.storageCondition) reasons.push("Storage condition is unknown.");
  if (rules.requirePackagingCondition && !input.packagingCondition) reasons.push("Packaging condition is unknown.");
  if (reasons.length) return { urgency: "MANUAL_REVIEW", acceptingAllowed: false, reasons, remainingMinutes };
  if (remainingMinutes <= rules.urgentWithinMinutes) return { urgency: "URGENT", acceptingAllowed: true, reasons: [`Only ${remainingMinutes} minutes remain in the verified collection window.`], remainingMinutes };
  if (remainingMinutes <= rules.timeSensitiveWithinMinutes) return { urgency: "TIME_SENSITIVE", acceptingAllowed: true, reasons: [`${remainingMinutes} minutes remain in the verified collection window.`], remainingMinutes };
  return { urgency: "NORMAL", acceptingAllowed: true, reasons: ["Collection window exceeds the configured time-sensitive threshold."], remainingMinutes };
}
