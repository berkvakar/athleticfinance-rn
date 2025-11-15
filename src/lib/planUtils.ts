export type PlanType = 'AF' | 'AF+';

export function isAFPlusMember(plan: string | undefined | null): boolean {
  return plan === 'AF+' || plan === 'AFPlus';
}

export function isAFMember(plan: string | undefined | null): boolean {
  return plan === 'AF' || !plan || (!isAFPlusMember(plan));
}

export function canAccessPremiumContent(plan: string | undefined | null): boolean {
  return isAFPlusMember(plan);
}

export function canAccessCommunity(plan: string | undefined | null): boolean {
  return isAFPlusMember(plan);
}

export function canAccessAFPlusPage(plan: string | undefined | null): boolean {
  return isAFPlusMember(plan);
}

