import { SetMetadata } from "@nestjs/common";

export const ALLOW_PRE_ONBOARDING_KEY = "academy:allowPreOnboarding";
export const AllowPreOnboarding = () => SetMetadata(ALLOW_PRE_ONBOARDING_KEY, true);
