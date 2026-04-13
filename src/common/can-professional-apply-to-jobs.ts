/**
 * Professionals may apply when an admin has activated their account (ACTIVE)
 * or they have finished self-serve signup (explicit setupCompleted, or verified
 * email + phone + liveness selfie).
 */
export function canProfessionalApplyToJobs(params: {
  userStatus: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  livenessSelfieUrl: string | null | undefined;
  /** True after liveness step completed (may be set without a resolvable selfie URL). */
  isPersonalCompleted?: boolean;
  setupCompleted: boolean;
}): boolean {
  const {
    userStatus,
    emailVerified,
    phoneVerified,
    livenessSelfieUrl,
    isPersonalCompleted,
    setupCompleted,
  } = params;

  const livenessDone =
    !!livenessSelfieUrl?.trim() || isPersonalCompleted === true;

  if (userStatus === 'SUSPENDED' || userStatus === 'PENDING_INVITATION') {
    return false;
  }

  if (userStatus === 'ACTIVE') {
    return true;
  }

  if (setupCompleted) {
    return true;
  }

  if (
    userStatus === 'VERIFIED' &&
    emailVerified &&
    phoneVerified &&
    livenessDone
  ) {
    return true;
  }

  return false;
}
